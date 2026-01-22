
<script setup lang="ts">
withDefaults(defineProps<{
  className?: string
}>(), {
  className: 'w-10 h-10'
});
</script>

<template>
  <div :class="className" class="relative overflow-hidden rounded-xl shadow-lg shrink-0">
    <img src="/logo.svg" alt="R.S Player Logo" class="w-full h-full object-cover transform transition-transform duration-500 group-hover:scale-110" />
  </div>
</template>
