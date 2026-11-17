'use client';
import { WalletReleaseAuthorization } from './WalletReleaseAuthorization';
import {useEffect,useState} from 'react';
import {walletApi,walletMoney} from './WalletView';
export default function WalletReleaseCard({id}:{id:string}){
 const[data,setData]=useState<any>(null),[confirming,setConfirming]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;walletApi('releases/'+id).then((d: any)=>{if(active)setData(d);}).catch((e: any)=>{if(active)setError(e.message);});return()=>{active=false;};},[id]);

 return <section className="my-3 space-y-3 rounded-xl border border-orange-300 bg-white p-4 text-slate-900"><h3 className="font-bold">GMD wallet release</h3>{error&&<p role="alert">{error}</p>}{data&&<><strong>{walletMoney(data.amountMinor)} · {data.status}</strong><p>{data.requestNumber} {data.title}</p><p>{data.purpose}</p>{data.items.map((i:any)=><div key={i.id}><p>{i.employeeName} ({i.employeeNumber}) · {i.organizationName} · {i.category} · {walletMoney(i.amountMinor)}</p>{i.bankSnapshot&&<p>Verified bank: {JSON.parse(i.bankSnapshot).accountName} · ending {JSON.parse(i.bankSnapshot).accountNumber.slice(-4)} · bank {JSON.parse(i.bankSnapshot).bankCode}</p>}</div>)}<p>{data.category==='VENDOR'?'Direct payment to the verified vendor bank; no staff wallet credit.':'Wallet credit only. Bank withdrawal is a separate staff action.'}</p>{data.status==='PENDING'&&new Date(data.expiresAt)>new Date()&&<button disabled={!data.canApprove||busy} onClick={()=>setConfirming(true)} className="rounded bg-orange-700 px-3 py-2 text-white disabled:opacity-50">{data.canApprove?'Review and approve':'Financial approval is not available for this account'}</button>}</>}
 {confirming&&<div role="dialog" aria-modal="true" aria-label="Secure wallet release confirmation" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"><div className="space-y-4 rounded-xl bg-white p-6"><h3 className="font-bold">Approve {walletMoney(data.amountMinor)}</h3><p>Confirm the exact recipients and allocations shown on the release card.</p><WalletReleaseAuthorization key={id} payload={{ id, confirmationHash: data.confirmationHash }} onBusy={setBusy}
 onApproved={async () => { setData(await walletApi('releases/'+id)); setConfirming(false); }} />
 <button disabled={busy} onClick={()=>setConfirming(false)}>Cancel</button></div></div>}
 </section>;
}
