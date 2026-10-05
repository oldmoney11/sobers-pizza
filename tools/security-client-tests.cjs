const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function dom() {
 const nodes = new Map();
 const node = name => {
  if (!nodes.has(name)) nodes.set(name, { hidden:false, disabled:false, value:'', textContent:'', elements:{email:{value:'device@example.invalid'},password:{value:'synthetic-test-only'},code:{value:'123456'}}, append(){}, showModal(){this.open=true;}, close(){this.open=false;}, remove(){this.removed=true;}, addEventListener(){}, querySelector: selector => node(selector) });
  return nodes.get(name);
 };
 return { document:{createElement:tag=>node(tag),body:node('body'),querySelector:selector=>node(selector)}, node };
}
function load(relative, extra) {
 const ui=dom(); const window={};
 const context=vm.createContext({window,document:ui.document,Date,Error,Promise,Object,fetch:extra.fetch, ...extra});
 context.window={...window,...extra.window};
 vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context);
 return {context,ui};
}
test('an already verified admin session does not need another challenge',async()=>{
 const {context}=load('admin/admin-security.js',{window:{RichRepublicSupabase:{auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2'}})}}}}});
 await context.window.SobersAdminSecurity.ensure();
});
test('admin access remains blocked until a valid MFA code is verified',async()=>{
 let valid=false;
 const {context,ui}=load('admin/admin-security.js',{window:{RichRepublicSupabase:{auth:{mfa:{
  getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1'}}),
  listFactors:async()=>({data:{totp:[{id:'synthetic-factor',status:'verified'}]}}),
  challengeAndVerify:async()=>({error:valid?null:new Error('Wrong code')})
 }}}}});
 let resolved=false;
 const promise=context.window.SobersAdminSecurity.ensure().then(()=>{resolved=true;});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(resolved,false);
 await ui.node('form').onsubmit({preventDefault(){}});
 assert.equal(resolved,false);
 assert.equal(ui.node('[data-message]').textContent,'Wrong code');
 valid=true;
 await ui.node('form').onsubmit({preventDefault(){}});
 await promise;
 assert.equal(resolved,true);
});
test('MFA service errors fail closed',async()=>{
 const {context}=load('admin/admin-security.js',{window:{RichRepublicSupabase:{auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({error:new Error('Unavailable')})}}}}});
 await assert.rejects(context.window.SobersAdminSecurity.ensure(),/Unavailable/);
});
