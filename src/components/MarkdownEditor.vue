<script setup lang="ts">
import {onBeforeUnmount,onMounted,ref,shallowRef} from 'vue'
import {Crepe,CrepeFeature} from '@milkdown/crepe'
import {editorViewCtx} from '@milkdown/kit/core'
import {lift,setBlockType,toggleMark,wrapIn} from '@milkdown/kit/prose/commands'
import {redo,undo} from '@milkdown/kit/prose/history'
import {liftListItem,wrapInList} from '@milkdown/kit/prose/schema-list'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
const props=defineProps<{modelValue:string;uploadImage:(file:File)=>Promise<string>;readClipboardImage:()=>Promise<File|null>}>(),emit=defineEmits<{change:[markdown:string]}>(),root=ref<HTMLElement>(),imageInput=ref<HTMLInputElement>(),crepe=shallowRef<Crepe>(),ready=ref(false),uploading=ref(false)
let pasteHandledAt=0
onMounted(async()=>{if(!root.value)return;const editor=new Crepe({root:root.value,defaultValue:props.modelValue,features:{[CrepeFeature.AI]:false,[CrepeFeature.Latex]:false},featureConfigs:{[CrepeFeature.ImageBlock]:{onUpload:props.uploadImage},[CrepeFeature.Placeholder]:{text:'在这里输入 Markdown 富文本…'}}});editor.on(listener=>listener.markdownUpdated((_ctx,markdown,previous)=>{if(markdown!==previous)emit('change',markdown)}));await editor.create();crepe.value=editor;ready.value=true})
onBeforeUnmount(()=>void crepe.value?.destroy())
function markCommand(name:'strong'|'emphasis'|'strike_through'|'inlineCode') {const editor=crepe.value?.editor;if(!editor)return false;return editor.action(ctx=>{const view=ctx.get(editorViewCtx),mark=view.state.schema.marks[name];view.focus();return mark?toggleMark(mark)(view.state,view.dispatch):false})}
function historyCommand(kind:'undo'|'redo'){const editor=crepe.value?.editor;if(!editor)return false;return editor.action(ctx=>{const view=ctx.get(editorViewCtx);view.focus();return(kind==='undo'?undo:redo)(view.state,view.dispatch)})}
async function insertManagedImage(file:File){const editor=crepe.value?.editor;if(!editor)return;uploading.value=true;try{const src=await props.uploadImage(file);editor.action(ctx=>{const view=ctx.get(editorViewCtx),image=view.state.schema.nodes.image;if(!image)throw new Error('编辑器未加载图片节点');view.focus();view.dispatch(view.state.tr.replaceSelectionWith(image.create({src,alt:file.name,title:file.name})).scrollIntoView())})}finally{uploading.value=false}}
async function chooseImage(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(file)await insertManagedImage(file)}
async function pasteImageFallback(event:ClipboardEvent){const direct=[...event.clipboardData?.files??[]].find(file=>file.type.startsWith('image/'));if(direct){event.preventDefault();pasteHandledAt=Date.now();await insertManagedImage(direct);return}const types=[...event.clipboardData?.types??[]];if(types.length&&!types.some(type=>type==='Files'||type.startsWith('image/')))return;event.preventDefault();const file=await props.readClipboardImage();if(file){pasteHandledAt=Date.now();await insertManagedImage(file)}}
async function keydownPasteFallback(event:KeyboardEvent){if(!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=='v')return;const started=Date.now(),file=await props.readClipboardImage();if(!file)return;await new Promise(resolve=>setTimeout(resolve,80));if(pasteHandledAt>=started)return;await insertManagedImage(file)}
function blockCommand(kind:'heading'|'bulletList'|'orderedList'|'blockquote'|'codeBlock'){
  const editor=crepe.value?.editor;if(!editor)return
  editor.action(ctx=>{const view=ctx.get(editorViewCtx),state=view.state,selection=state.selection,nodeNames:Array<string>=[];for(let depth=selection.$from.depth;depth>=0;depth--)nodeNames.push(selection.$from.node(depth).type.name);for(let depth=selection.$to.depth;depth>=0;depth--)nodeNames.push(selection.$to.node(depth).type.name);const selectedNode=(selection as unknown as {node?:{type:{name:string}}}).node;if(selectedNode)nodeNames.push(selectedNode.type.name);view.focus();const paragraph=state.schema.nodes.paragraph;if(kind==='heading')return(nodeNames.includes('heading')?setBlockType(paragraph):setBlockType(state.schema.nodes.heading,{level:2}))(state,view.dispatch);if(kind==='codeBlock')return(nodeNames.includes('code_block')?setBlockType(paragraph):setBlockType(state.schema.nodes.code_block))(state,view.dispatch);if(kind==='blockquote')return(nodeNames.includes('blockquote')?lift:wrapIn(state.schema.nodes.blockquote))(state,view.dispatch);if(kind==='bulletList'||kind==='orderedList'){const item=state.schema.nodes.list_item;if(nodeNames.some(name=>name==='bullet_list'||name==='ordered_list'))return liftListItem(item)(state,view.dispatch);return wrapInList(state.schema.nodes[kind==='bulletList'?'bullet_list':'ordered_list'])(state,view.dispatch)}return false})
}
</script>
<template><div class="markdown-editor-frame"><div class="rich-toolbar" role="toolbar" aria-label="Markdown 格式工具栏">
  <button :disabled="!ready" title="标题（二级）" aria-label="标题（二级）" @mousedown.prevent="blockCommand('heading')">H2</button>
  <button :disabled="!ready" title="粗体" aria-label="粗体" @mousedown.prevent="markCommand('strong')"><b>B</b></button>
  <button :disabled="!ready" title="斜体" aria-label="斜体" @mousedown.prevent="markCommand('emphasis')"><i>I</i></button>
  <button :disabled="!ready" title="删除线" aria-label="删除线" @mousedown.prevent="markCommand('strike_through')"><s>S</s></button>
  <span></span>
  <button :disabled="!ready" title="无序列表" aria-label="无序列表" @mousedown.prevent="blockCommand('bulletList')">• 列表</button>
  <button :disabled="!ready" title="有序列表" aria-label="有序列表" @mousedown.prevent="blockCommand('orderedList')">1. 列表</button>
  <button :disabled="!ready" title="引用" aria-label="引用" @mousedown.prevent="blockCommand('blockquote')">引用</button>
  <button :disabled="!ready" title="行内代码" aria-label="行内代码" @mousedown.prevent="markCommand('inlineCode')">&lt;/&gt;</button>
  <button :disabled="!ready" title="代码块" aria-label="代码块" @mousedown.prevent="blockCommand('codeBlock')">代码块</button>
  <button :disabled="!ready||uploading" title="插入图片" aria-label="插入图片" @mousedown.prevent="imageInput?.click()">{{uploading?'上传中…':'图片'}}</button>
  <input ref="imageInput" class="editor-image-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" @change="chooseImage" />
  <span></span>
  <button :disabled="!ready" title="撤销" aria-label="撤销" @mousedown.prevent="historyCommand('undo')">撤销</button>
  <button :disabled="!ready" title="重做" aria-label="重做" @mousedown.prevent="historyCommand('redo')">重做</button>
</div><div ref="root" class="milkdown-host" aria-label="Markdown 富文本编辑器" @keydown.capture="keydownPasteFallback" @paste.capture="pasteImageFallback"></div></div></template>
