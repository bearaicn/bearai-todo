<script setup lang="ts">
import {onBeforeUnmount,onMounted,ref} from 'vue'
import {Crepe,CrepeFeature} from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
const props=defineProps<{modelValue:string;uploadImage:(file:File)=>Promise<string>}>(),emit=defineEmits<{change:[markdown:string]}>(),root=ref<HTMLElement>(),crepe=ref<Crepe>()
onMounted(async()=>{if(!root.value)return;const editor=new Crepe({root:root.value,defaultValue:props.modelValue,features:{[CrepeFeature.AI]:false,[CrepeFeature.Latex]:false},featureConfigs:{[CrepeFeature.ImageBlock]:{onUpload:props.uploadImage}}});editor.on(listener=>listener.markdownUpdated((_ctx,markdown,previous)=>{if(markdown!==previous)emit('change',markdown)}));await editor.create();crepe.value=editor})
onBeforeUnmount(()=>void crepe.value?.destroy())
</script>
<template><div ref="root" class="milkdown-host" aria-label="Markdown 富文本编辑器"></div></template>
