/**
 * Source-rate regression against the canonical pre-Unimat code, including
 * rate, fee deduction, explicit overrides, and operating expense.
 * No real records, network requests or persistence.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
const baselineSha='fa8919691508096f11124c66e438182ebc7e3b46';
const before=execFileSync('git',['show',baselineSha+':js/revenue-brain.js'],{encoding:'utf8'});
const current=readFileSync(new URL('../js/revenue-brain.js',import.meta.url),'utf8');
const profit=readFileSync(new URL('../js/profit-brain.js',import.meta.url),'utf8');
const summary=readFileSync(new URL('../js/revenue-summary-brain.js',import.meta.url),'utf8');
function load(source){
 const context=vm.createContext({console:{warn:()=>{},info:()=>{},error:()=>{}},Date,Intl});
 const r=vm.runInContext(source+'\n;RevenueBrain',context);
 const p=vm.runInContext(profit+'\n;ProfitBrain',context);
 const rs=vm.runInContext(summary+'\n;RevenueSummaryBrain',context);
 return {r,p,rs};
}
const old=load(before), now=load(current);
const candidates=[
 'LP','直受け','直請','自社','自社LINE','LINE','line','Airリザーブ','airリザーブ',
 '電話','既存客','紹介直','紹介','Google','Google検索','google_calendar','ホームページ',
 'HP','Web','自社導線','コープ','コープハウジング','生協','COOP',
 '片付け110番','110番','エアコン110番','くらしのマーケット','くらし','くらマ',
 'ヤマダ','ヤマダ電機','YAMADA','その他','不明','未設定','判定不能','','エソラ',
 'ココナラ','未登録の取引先'
];
const amounts=[0,1,99,100,999,1000,10001,12000,12345,13200,20000,25300,99999,123456,999999];
const explicitRates=['',null,0,35,60,80,100];
const expenses=[0,230,2000,5000];
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
for(const source of candidates){
 for(const key of ['normalizeRevenueSource','getSourceProfitRate','getDefaultGrossProfitRateBySource','normalizeSourceForForm']){
   eq(now.r[key](source),old.r[key](source),'source: '+source+' '+key);
 }
 eq(now.rs.getRevenueSource({source}),old.rs.getRevenueSource({source}),'summary: '+source);
 for(const amount of amounts){
   eq(now.r.calculateNetRevenueBySource(amount,source),old.r.calculateNetRevenueBySource(amount,source),'commission: '+source+':'+amount);
   eq(now.r.computeRecordGrossShare({source,amount}),old.r.computeRecordGrossShare({source,amount}),'gross: '+source+':'+amount);
   for(const rate of explicitRates){
      const record={source,amount,grossMarginRate:rate,status:'確定',workDate:'2026-11-01'};
      eq(now.r.resolveGrossMarginRate(record),old.r.resolveGrossMarginRate(record),'override rate: '+source+':'+amount+':'+rate);
      eq(now.r.computeRecordGrossShare(record),old.r.computeRecordGrossShare(record),'override profit: '+source+':'+amount+':'+rate);
      for(const exp of expenses){
       const currentProfit=now.p.computeRevenueRowProfit(record,exp);
       const oldProfit=old.p.computeRevenueRowProfit(record,exp);
       eq(currentProfit,oldProfit,'operating profit: '+source+':'+amount+':'+rate+':'+exp);
      }
   }
 }
}
for(const [source,rate] of [['LP',100],['直受け',100],['コープ',80],['110番',80],['くらしのマーケット',80],['ヤマダ',60]]){
 assert.equal(now.r.getDefaultGrossProfitRateBySource(source),rate);
 checks++;
 const expected=Math.round(20000*rate/100);
 assert.equal(now.r.computeRecordGrossShare({source,amount:20000}),expected);
 checks++;
 const p=now.p.computeRevenueRowProfit({source,amount:20000},2000);
 assert.equal(p.marginProfit,expected);
 assert.equal(p.grossProfit,expected-2000);
 checks+=2;
}
assert.equal(now.r.getDefaultGrossProfitRateBySource('ユニマット'),100);
assert.equal(now.r.getSourceProfitRate('ユニマット').reviewRequired,false);
assert.equal(now.r.computeRecordGrossShare({source:'ユニマット',amount:13200}),13200);
assert.equal(now.p.computeRevenueRowProfit({source:'ユニマット',amount:13200},2200).grossProfit,11000);
assert.equal(now.r.getSourceProfitRate('その他').reviewRequired,true);
assert.equal(now.r.getDefaultGrossProfitRateBySource('その他'),null);
assert.equal(now.r.getDefaultGrossProfitRateBySource('未登録元請け'),null);
checks+=7;
console.log('PRIME_SOURCE_PRE_UNIMAT_EQUIVALENCE=PASS comparisons='+checks+' scenarios='+candidates.length+' sources, '+amounts.length+' amounts, '+explicitRates.length+' override rates, '+expenses.length+' costs');
