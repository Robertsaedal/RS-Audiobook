
<script setup lang="ts">
withDefaults(defineProps<{
  className?: string
}>(), {
  className: 'w-10 h-10'
});
</script>

<template>
  <div :class="className" class="relative overflow-hidden rounded-xl shadow-lg shrink-0">
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full transform transition-transform duration-500 group-hover:scale-110">
      <defs>
        <linearGradient id="logo_grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stop-color="#A855F7"/>
          <stop offset="1" stop-color="#7E22CE"/>
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      <!-- Background -->
      <rect width="100" height="100" fill="#111"/>
      <rect width="100" height="100" fill="url(#logo_grad)" fill-opacity="0.15"/>
      <rect x="0.5" y="0.5" width="99" height="99" rx="20" stroke="white" stroke-opacity="0.1"/>

      <!-- Stylized Book / Waveform Shape -->
      <g filter="url(#glow)">
        <path d="M30 30 C30 24 36 24 36 30 V70 C36 76 30 76 30 70 V30 Z" fill="#A855F7"/>
        <path d="M50 20 C50 14 56 14 56 20 V80 C56 86 50 86 50 80 V20 Z" fill="white"/>
        <path d="M70 40 C70 34 76 34 76 40 V60 C76 66 70 66 70 60 V40 Z" fill="#A855F7"/>
      </g>
    </svg>
  </div>
</template>
