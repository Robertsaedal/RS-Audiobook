
import { reactive, ref, computed } from 'vue';
import { TranscriptionService } from '../services/transcriptionService';

export interface QueueItem {
  id: string; // Unique ID (usually itemID + timestamp)
  itemId: string; // The Book/Track ID
  downloadUrl: string;
  duration: number;
  currentTime: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying' | 'paused';
  progress: number; // 0-100
  error?: string;
  retryCount: number;
  nextRetryTime?: number; // Timestamp when retry is allowed
}

// Global State (Singleton)
const queue = reactive<QueueItem[]>([]);
const isProcessing = ref(false);
const isPaused = ref(false);
const cooldownTimer = ref(0);

export function useTranscriptionQueue() {
  
  const activeItem = computed(() => queue.find(i => i.status === 'processing'));
  const queueLength = computed(() => queue.filter(i => i.status === 'pending').length);

  const generateId = (itemId: string, time: number) => `${itemId}_${Math.floor(time)}`;

  const addToQueue = (itemId: string, downloadUrl: string, duration: number, currentTime: number) => {
    const id = generateId(itemId, currentTime);
    
    // Check if exists
    const existingItem = queue.find(i => i.id === id);
    if (existingItem) {
        // CRITICAL FIX: If it failed previously, reset it so we can try again
        if (existingItem.status === 'failed') {
            console.log(`[Queue] Retrying failed item: ${id}`);
            existingItem.status = 'pending';
            existingItem.error = undefined;
            existingItem.progress = 0;
            existingItem.retryCount = 0; // Reset retries on manual action
            processQueue();
        }
        return;
    }

    const item: QueueItem = {
      id,
      itemId,
      downloadUrl,
      duration,
      currentTime,
      status: 'pending',
      progress: 0,
      retryCount: 0
    };

    queue.push(item);
    processQueue();
  };

  const removeFromQueue = (id: string) => {
    const idx = queue.findIndex(i => i.id === id);
    if (idx !== -1) queue.splice(idx, 1);
  };

  const clearQueue = () => {
    // Keep currently processing item, remove others
    const active = queue.find(i => i.status === 'processing');
    queue.splice(0, queue.length);
    if (active) queue.push(active);
  };

  const pauseQueue = () => {
    isPaused.value = true;
  };

  const resumeQueue = () => {
    isPaused.value = false;
    processQueue();
  };

  const processQueue = async () => {
    if (isProcessing.value || isPaused.value) return;

    // 1. Find next item (prioritize retrying items that are ready)
    const now = Date.now();
    const nextItem = queue.find(i => {
      if (i.status === 'pending') return true;
      if (i.status === 'retrying' && i.nextRetryTime && i.nextRetryTime <= now) return true;
      return false;
    });

    if (!nextItem) {
      // Check if we have items waiting for cooldown
      const futureItem = queue.find(i => i.status === 'retrying');
      if (futureItem && futureItem.nextRetryTime) {
        const wait = futureItem.nextRetryTime - now;
        if (wait > 0) {
           console.log(`[Queue] Waiting ${Math.ceil(wait/1000)}s for cooldown...`);
           setTimeout(processQueue, wait); 
        }
      }
      return;
    }

    // 2. Start Processing
    isProcessing.value = true;
    nextItem.status = 'processing';
    nextItem.error = undefined;

    try {
      console.log(`[Queue] Starting Job: ${nextItem.id}`);
      
      await TranscriptionService.generateTranscript(
        nextItem.itemId,
        nextItem.downloadUrl,
        nextItem.duration,
        (chunk) => {
          // Simple progress simulation based on chunk activity
          // Real progress is hard with streams, but we can animate the UI
          if (nextItem.progress < 90) nextItem.progress += 1;
        },
        nextItem.currentTime
      );

      nextItem.status = 'completed';
      nextItem.progress = 100;
      
      // Auto-remove completed after a delay to keep list clean
      setTimeout(() => removeFromQueue(nextItem.id), 5000);

    } catch (error: any) {
      console.error(`[Queue] Job Failed: ${nextItem.id}`, error);
      
      const isRateLimit = error.message?.includes('429') || error.message?.includes('Resource Exhausted');
      
      if (isRateLimit) {
        handleRateLimit(nextItem);
      } else {
        nextItem.status = 'failed';
        nextItem.error = error.message;
      }
    } finally {
      isProcessing.value = false;
      // Triggers recursion
      processQueue(); 
    }
  };

  const handleRateLimit = (item: QueueItem) => {
    item.retryCount++;
    
    // Exponential Backoff: 20s, 40s, 80s...
    const delaySeconds = 20 * Math.pow(2, item.retryCount - 1);
    const retryTime = Date.now() + (delaySeconds * 1000);
    
    item.status = 'retrying';
    item.nextRetryTime = retryTime;
    item.error = `Rate Limit. Retrying in ${delaySeconds}s...`;
    
    // Global cooldown visibility
    startCooldownTimer(delaySeconds);

    console.warn(`[Queue] 429 Detected. Backing off for ${delaySeconds}s.`);
  };

  const startCooldownTimer = (seconds: number) => {
    cooldownTimer.value = seconds;
    const interval = setInterval(() => {
      cooldownTimer.value--;
      if (cooldownTimer.value <= 0) clearInterval(interval);
    }, 1000);
  };

  const getItemStatus = (itemId: string, currentTime: number) => {
    const id = generateId(itemId, currentTime);
    return queue.find(i => i.id === id);
  };

  return {
    queue,
    isProcessing,
    isPaused,
    cooldownTimer,
    activeItem,
    addToQueue,
    removeFromQueue,
    clearQueue,
    pauseQueue,
    resumeQueue,
    getItemStatus
  };
}
