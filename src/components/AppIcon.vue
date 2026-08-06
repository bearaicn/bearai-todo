<script setup lang="ts">
defineProps<{name:string;size?:number}>()
</script>

<template>
  <svg class="app-icon" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name==='search'"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></template>
    <template v-else-if="name==='sun'"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></template>
    <template v-else-if="name==='star'"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></template>
    <template v-else-if="name==='calendar'"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></template>
    <template v-else-if="name==='check-circle'"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></template>
    <template v-else-if="name==='check'"><path d="m6 12 4 4 8-9"/></template>
    <template v-else-if="name==='chevron-right'"><path d="m9 18 6-6-6-6"/></template>
    <template v-else-if="name==='chevron-down'"><path d="m6 9 6 6 6-6"/></template>
    <template v-else-if="name==='chevron-up'"><path d="m6 15 6-6 6 6"/></template>
    <template v-else-if="name==='plus'"><path d="M12 5v14M5 12h14"/></template>
    <template v-else-if="name==='more'"><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></template>
    <template v-else-if="name==='edit'"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></template>
    <template v-else-if="name==='move'"><path d="M5 9V5h4M19 15v4h-4M5 5l5 5M19 19l-5-5"/></template>
    <template v-else-if="name==='archive'"><path d="M3 6h18M5 6v14h14V6M9 10h6"/><rect x="3" y="3" width="18" height="3" rx="1"/></template>
    <template v-else-if="name==='settings'"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></template>
    <template v-else-if="name==='user'"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></template>
    <template v-else-if="name==='sync'"><path d="M20 7h-5V2M4 17h5v5M5.5 9A7 7 0 0 1 18 6l2 1M18.5 15A7 7 0 0 1 6 18l-2-1"/></template>
    <template v-else-if="name==='clock'"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></template>
    <template v-else-if="name==='repeat'"><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/></template>
    <template v-else-if="name==='close'"><path d="M6 6l12 12M18 6 6 18"/></template>
    <template v-else-if="name==='minimize'"><path d="M5 12h14"/></template>
    <template v-else-if="name==='maximize'"><rect x="5" y="5" width="14" height="14" rx="1"/></template>
    <template v-else-if="name==='folder'"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></template>
  </svg>
</template>
