<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Task } from './domain/task'
const tasks=ref<Task[]>([]), selected=ref<Task>(), draft=ref(''), error=ref('')
const smart=[['☀','我的一天'],['★','重要'],['▣','计划内'],['∞','全部'],['✓','已完成']]
const active=computed(()=>tasks.value.filter(t=>t.status==='active'))
async function add(){const title=draft.value.trim();if(!title)return;const task=window.bearTodo?await window.bearTodo.createTask(title):mock(title);tasks.value.unshift(task);draft.value='';selected.value=task}
async function save(task:Task, patch:Partial<Task>){error.value='';const original=task.revision;Object.assign(task,patch);try{const saved=window.bearTodo?await window.bearTodo.saveTask(task,original):{...task,revision:original+1};Object.assign(task,saved)}catch(reason){error.value=reason instanceof Error?reason.message:'保存失败，请重新加载';if(window.bearTodo)tasks.value=await window.bearTodo.listTasks()}}
async function toggleDone(task:Task){await save(task,{status:task.status==='completed'?'active':'completed',completedAt:task.status==='completed'?null:new Date().toISOString()})}
function mock(title:string):Task{const now=new Date().toISOString();return{schema:'bearai.todo/task@1',id:crypto.randomUUID(),revision:1,title,listId:'inbox',status:'active',important:false,tags:[],steps:[],attachments:[],createdAt:now,updatedAt:now,note:'',extra:{}}}
onMounted(async()=>{if(window.bearTodo)tasks.value=await window.bearTodo.listTasks()})
</script>
<template><main class="shell">
  <aside class="nav"><div class="brand"><span class="bear">熊</span><strong>熊智ToDo</strong></div><input class="search" placeholder="搜索"/><button v-for="item in smart" :key="item[1]"><span>{{item[0]}}</span>{{item[1]}}</button><hr/><button class="selected"><span>☷</span>任务 <small>{{active.length}}</small></button><div class="spacer"/><button><span>＋</span>新建列表</button></aside>
  <section class="list"><header><p>{{new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}}</p><h1>任务</h1></header><p v-if="error" class="error">{{error}}</p><div class="add"><span>＋</span><input v-model="draft" @keyup.enter="add" placeholder="添加任务"/></div><div class="cards"><article v-for="task in active" :key="task.id" @click="selected=task" :class="{active:selected?.id===task.id}"><button class="circle" aria-label="完成" @click.stop="toggleDone(task)"></button><div><strong>{{task.title}}</strong><small>任务</small></div><button class="star" @click.stop="save(task,{important:!task.important})">{{task.important?'★':'☆'}}</button></article><div v-if="!active.length" class="empty"><b>今天从一件小事开始</b><span>任务会安全地保存在本地 Markdown 文件中</span></div></div></section>
  <aside v-if="selected" class="detail"><div class="task-title"><button class="circle" @click="toggleDone(selected)"></button><input v-model="selected.title" @change="save(selected,{title:selected.title})"/><button class="star" @click="save(selected,{important:!selected.important})">{{selected.important?'★':'☆'}}</button></div><button>＋ 添加步骤</button><button>☀ 加入“我的一天”</button><button>◷ 提醒我</button><button>▣ 添加截止日期</button><button>↻ 重复</button><textarea v-model="selected.note" @change="save(selected,{note:selected.note})" placeholder="添加备注"></textarea><small>创建于 {{new Date(selected.createdAt).toLocaleDateString()}}</small></aside>
</main></template>
