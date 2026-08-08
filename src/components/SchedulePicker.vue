<script setup lang="ts">
import {computed,nextTick,ref} from 'vue'
import {VueDatePicker} from '@vuepic/vue-datepicker'
import {zhCN} from 'date-fns/locale'
import '@vuepic/vue-datepicker/dist/main.css'
import AppIcon from './AppIcon.vue'

const props=defineProps<{kind:'due'|'reminder';modelValue?:string|null}>()
const emit=defineEmits<{change:[value:string|null]}>()
const menuOpen=ref(false),dateOpen=ref(false),picker=ref<InstanceType<typeof VueDatePicker>>()
const value=computed(()=>props.modelValue?new Date(props.modelValue):null)
const label=computed(()=>props.kind==='due'?'截止时间':'提醒我')
const icon=computed(()=>props.kind==='due'?'calendar':'clock')
const display=computed(()=>value.value&&!Number.isNaN(value.value.getTime())?(props.kind==='due'&&/^\d{4}-\d{2}-\d{2}$/.test(props.modelValue??'')?value.value.toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'}):value.value.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})):props.kind==='due'?'添加截止日期':'选择提醒时间')
function at(hour:number,dayOffset=0){const result=new Date();result.setDate(result.getDate()+dayOffset);result.setHours(hour,0,0,0);return result}
const choices=computed(()=>props.kind==='due'?[{label:'今天',hint:new Date().toLocaleDateString('zh-CN',{weekday:'short'}),value:at(23,0)},{label:'明天',hint:new Date(Date.now()+86400000).toLocaleDateString('zh-CN',{weekday:'short'}),value:at(23,1)},{label:'下周',hint:new Date(Date.now()+7*86400000).toLocaleDateString('zh-CN',{weekday:'short'}),value:at(23,7)}]:[{label:'今天晚些时候',hint:'今天 18:00',value:at(18,0)},{label:'明天',hint:'明天 09:00',value:at(9,1)},{label:'下周',hint:'下周 09:00',value:at(9,7)}])
function choose(date:Date|null){if(!date)emit('change',null);else if(props.kind==='due')emit('change',`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`);else emit('change',date.toISOString());menuOpen.value=false}
async function openPicker(){menuOpen.value=false;await nextTick();picker.value?.openMenu()}
</script>

<template>
  <div class="schedule-picker">
    <button class="schedule-trigger" :aria-expanded="menuOpen" @click="menuOpen=!menuOpen">
      <AppIcon :name="icon" :size="18"/><span>{{label}}</span><b>{{display}}</b>
    </button>
    <div v-if="menuOpen" class="schedule-quick-menu" @click.stop>
      <button v-for="choice in choices" :key="choice.label" @click="choose(choice.value)"><span>{{choice.label}}</span><small>{{choice.hint}}</small></button>
      <button class="custom-date" @click="openPicker"><AppIcon name="calendar" :size="17"/><span>{{kind==='due'?'选择日期':'选择日期和时间'}}</span></button>
      <button v-if="modelValue" class="clear-date" @click="choose(null)">清除当前时间</button>
    </div>
    <VueDatePicker ref="picker" class="date-picker-hidden-trigger" :model-value="value" :locale="zhCN" :is-24="true" :enable-time-picker="kind==='reminder'" :enable-seconds="false" :minutes-increment="5" :clearable="true" :teleport="true" :auto-apply="false" select-text="保存" cancel-text="取消" :format="kind==='due'?'yyyy年MM月dd日':'yyyy年MM月dd日 HH:mm'" @open="dateOpen=true" @closed="dateOpen=false" @update:model-value="choose($event as Date|null)" />
    <span v-if="dateOpen" class="date-picker-open-marker" aria-live="polite">日期选择器已打开</span>
  </div>
</template>
