<script setup lang="ts">
import {onBeforeUnmount,onMounted,ref} from 'vue'
import {Crepe,CrepeFeature} from '@milkdown/crepe'
import {callCommand} from '@milkdown/kit/utils'
import {toggleStrongCommand,toggleEmphasisCommand,wrapInHeadingCommand,wrapInBulletListCommand,wrapInOrderedListCommand,wrapInBlockquoteCommand,toggleInlineCodeCommand,createCodeBlockCommand} from '@milkdown/kit/preset/commonmark'
import {toggleStrikethroughCommand} from '@milkdown/kit/preset/gfm'
import {undoCommand,redoCommand} from '@milkdown/kit/plugin/history'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
const props=defineProps<{modelValue:string;uploadImage:(file:File)=>Promise<string>}>(),emit=defineEmits<{change:[markdown:string]}>(),root=ref<HTMLElement>(),crepe=ref<Crepe>()
onMounted(async()=>{if(!root.value)return;const editor=new Crepe({root:root.value,defaultValue:props.modelValue,features:{[CrepeFeature.AI]:false,[CrepeFeature.Latex]:false},featureConfigs:{[CrepeFeature.ImageBlock]:{onUpload:props.uploadImage},[CrepeFeature.Placeholder]:{text:'在这里输入 Markdown 富文本…'}}});editor.on(listener=>listener.markdownUpdated((_ctx,markdown,previous)=>{if(markdown!==previous)emit('change',markdown)}));await editor.create();crepe.value=editor})
onBeforeUnmount(()=>void crepe.value?.destroy())
function command(key:unknown,payload?:unknown){const editor=crepe.value?.editor;if(editor)editor.action(callCommand(key as never,payload as never))}
</script>
<template><div class="markdown-editor-frame"><div class="rich-toolbar" role="toolbar" aria-label="Markdown 格式工具栏">
  <button title="标题" aria-label="标题" @mousedown.prevent="command(wrapInHeadingCommand.key,2)">H2</button>
  <button title="粗体" aria-label="粗体" @mousedown.prevent="command(toggleStrongCommand.key)"><b>B</b></button>
  <button title="斜体" aria-label="斜体" @mousedown.prevent="command(toggleEmphasisCommand.key)"><i>I</i></button>
  <button title="删除线" aria-label="删除线" @mousedown.prevent="command(toggleStrikethroughCommand.key)"><s>S</s></button>
  <span></span>
  <button title="无序列表" aria-label="无序列表" @mousedown.prevent="command(wrapInBulletListCommand.key)">• 列表</button>
  <button title="有序列表" aria-label="有序列表" @mousedown.prevent="command(wrapInOrderedListCommand.key)">1. 列表</button>
  <button title="引用" aria-label="引用" @mousedown.prevent="command(wrapInBlockquoteCommand.key)">引用</button>
  <button title="行内代码" aria-label="行内代码" @mousedown.prevent="command(toggleInlineCodeCommand.key)">&lt;/&gt;</button>
  <button title="代码块" aria-label="代码块" @mousedown.prevent="command(createCodeBlockCommand.key)">代码块</button>
  <span></span>
  <button title="撤销" aria-label="撤销" @mousedown.prevent="command(undoCommand.key)">撤销</button>
  <button title="重做" aria-label="重做" @mousedown.prevent="command(redoCommand.key)">重做</button>
</div><div ref="root" class="milkdown-host" aria-label="Markdown 富文本编辑器"></div></div></template>
