<script setup lang="ts">
import {nextTick,onBeforeUnmount,onMounted,ref} from 'vue'
import AppIcon from './AppIcon.vue'
defineProps<{title:string;message:string;confirmLabel?:string;danger?:boolean}>()
const emit=defineEmits<{confirm:[];cancel:[]}>(),panel=ref<HTMLElement>(),previous=document.activeElement as HTMLElement|null
function cancel(){emit('cancel')}
function keydown(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();cancel();return}if(event.key!=='Tab'||!panel.value)return;const items=[...panel.value.querySelectorAll<HTMLElement>('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')];if(!items.length)return;const first=items[0],last=items.at(-1)!;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
onMounted(()=>{document.addEventListener('keydown',keydown);void nextTick(()=>panel.value?.querySelector<HTMLElement>('[data-initial-focus]')?.focus())})
onBeforeUnmount(()=>{document.removeEventListener('keydown',keydown);void nextTick(()=>previous?.focus())})
</script>
<template><div class="modal-backdrop confirm-backdrop" role="presentation" @mousedown.self="cancel"><section ref="panel" class="modal compact confirm-dialog" role="alertdialog" aria-modal="true" :aria-labelledby="`confirm-title-${$.uid}`" :aria-describedby="`confirm-message-${$.uid}`"><button class="confirm-close" aria-label="关闭确认对话框" @click="cancel"><AppIcon name="close" :size="16"/></button><div class="confirm-icon" :class="{danger}"><AppIcon name="archive" :size="22"/></div><h2 :id="`confirm-title-${$.uid}`">{{title}}</h2><p :id="`confirm-message-${$.uid}`">{{message}}</p><div class="modal-actions"><button data-initial-focus @click="cancel">取消</button><button class="primary" :class="{danger}" @click="emit('confirm')">{{confirmLabel??'确认'}}</button></div></section></div></template>
