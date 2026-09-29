import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {loadTypeScript} from './helpers/load-typescript.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
async function fixture({missing=false,initial=true,fields=[],members=[],fail=null}={}){
 const calls=[];const tx={};const error=new Error('activity unavailable');
 const workflow={id:'wf-1',statuses:[{id:'todo',name:'Todo',category:'TODO',isInitial:initial}]};
 const record=(name,data,client)=>{assert.equal(client,tx);calls.push([name,plain(data)]);if(fail===name)throw error;};
 const {issueService}=await loadTypeScript('src/services/issues/issueService.ts',{root:path.resolve('.'),stubs:{
  '@prisma/client':{CustomFieldType:{TEXT:'TEXT',NUMBER:'NUMBER',DATE:'DATE',SINGLE_SELECT:'SINGLE_SELECT'},Prisma:{JsonNull:{jsonNull:true}}},
  '@/lib/db':{db:{$transaction:async fn=>{calls.push(['tx']);return fn(tx);}}},
  '@/repositories/projectRepository':{projectRepository:{getProjectSetup:async args=>{calls.push(['setup',plain(args)]);return missing?null:{workflow,customFields:fields};},listProjectMembers:async args=>{calls.push(['members',plain(args)]);return members;}}},
  '@/repositories/issueRepository':{issueRepository:{getNextSequenceNumber:async(data,client)=>{record('sequence',data,client);return 8;},createIssue:async(data,client)=>{record('create',data,client);return {id:'issue-8'};},createActivity:async(data,client)=>record('activity',data,client),upsertCustomFieldValues:async(id,org,data,client)=>record('custom',{id,org,data},client)}},
  '@/services/automation/automationService':{automationService:{enqueueIssueEvent:async(data,client)=>record('event',data,client)}}
 }});
 const access={organizationId:'org-1',projectId:'project-1',projectKey:'OPS',organizationRole:'ORG_MEMBER',projectRole:'LEAD'};
 return {calls,error,run:(payload={},projectRole='LEAD')=>issueService.createIssue({access:{...access,projectRole},actorUserId:'user-1',payload:{title:'Retry sync',type:'TASK',priority:'HIGH',customFieldValues:[],...payload}})};
}
test('issue creation forwards exact scope, initial status and same transaction to side effects',async()=>{
 const f=await fixture();assert.deepEqual(plain(await f.run()),{id:'issue-8',key:'OPS-8'});
 assert.deepEqual(f.calls.map(x=>x[0]),['setup','tx','sequence','create','activity','event']);
 const data=f.calls.find(x=>x[0]==='create')[1];assert.equal(data.organizationId,'org-1');assert.equal(data.projectId,'project-1');assert.equal(data.workflowId,'wf-1');assert.equal(data.statusId,'todo');assert.equal(data.sequenceNumber,8);assert.equal(data.reporterId,'user-1');
 assert.equal(f.calls.at(-1)[1].payload.toStatusId,'todo');assert.equal(f.calls.at(-1)[1].eventType,'ISSUE_CREATED');
});
test('actual observer permission and workflow refusals occur before transaction',async()=>{
 const observer=await fixture();await assert.rejects(observer.run({},'OBSERVER'),e=>e.statusCode===403);assert.deepEqual(observer.calls,[]);
 for(const [opts,status] of [[{missing:true},404],[{initial:false},409]]){const f=await fixture(opts);await assert.rejects(f.run(),e=>e.statusCode===status);assert.deepEqual(f.calls.map(x=>x[0]),['setup']);}
});
test('assignee membership query is scoped and foreign assignee prevents writes',async()=>{
 const f=await fixture();await assert.rejects(f.run({assigneeId:'outsider'}),e=>e.statusCode===400);assert.deepEqual(f.calls.map(x=>x[0]),['setup','members']);assert.deepEqual(f.calls[1][1],{organizationId:'org-1',projectId:'project-1'});
});
test('actual custom-field validation refuses missing or mistyped required values and stores valid value',async()=>{
 const fields=[{id:'points',name:'Points',type:'NUMBER',required:true,config:null}];
 for(const values of [[],[{customFieldId:'points',value:'three'}],[{customFieldId:'foreign',value:3}]]){const f=await fixture({fields});await assert.rejects(f.run({customFieldValues:values}),e=>e.statusCode===400);assert.deepEqual(f.calls.map(x=>x[0]),['setup']);}
 const f=await fixture({fields});await f.run({customFieldValues:[{customFieldId:'points',value:3}]});assert.deepEqual(f.calls.find(x=>x[0]==='custom')[1],{id:'issue-8',org:'org-1',data:[{customFieldId:'points',value:3}]});
});
test('activity error propagates after attempted issue creation without automation enqueue',async()=>{
 const f=await fixture({fail:'activity'});await assert.rejects(f.run(),e=>e===f.error);assert.deepEqual(f.calls.map(x=>x[0]),['setup','tx','sequence','create','activity']);
});
