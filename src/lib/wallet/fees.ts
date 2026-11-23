import {Prisma} from '@prisma/client';
import {WalletError,minorUnits} from './core';
export async function requiredFeeReserve(tx:Prisma.TransactionClient,extraCredits:Array<{employeeId:string|null;amountMinor:bigint}>=[],extraDirectFee=BigInt(0)){
 const fee=minorUnits(process.env.BEMS_WALLET_MAX_TRANSFER_FEE_MINOR || '4500');
 const rows=await tx.$queryRaw<Array<{employeeId:string;amount:bigint}>>`SELECT "employeeId",sum("availableMinor")::bigint AS "amount" FROM "WalletCreditLot" GROUP BY "employeeId"`;
 const amounts=new Map(rows.map(r=>[r.employeeId,r.amount]));
 for(const c of extraCredits)if(c.employeeId)amounts.set(c.employeeId,(amounts.get(c.employeeId)||BigInt(0))+c.amountMinor);
 const[held]=await tx.$queryRaw<Array<{amount:bigint}>>`SELECT COALESCE(sum("feeLimitMinor"),0)::bigint AS "amount" FROM "WalletWithdrawal" WHERE "status" IN ('HELD','SUBMITTING','PENDING','UNKNOWN')`;
 // Reserve one flat Monnify transfer fee per active staff wallet with positive balance
 // (scales cleanly to multi-million Naira transactions without multiplying by minimum withdrawal splits).
 return [...amounts.values()].reduce((n,amount)=>amount>BigInt(0)?n+fee:n,held.amount+extraDirectFee);
}

/** A reserve target can use free cash, never manufacture a deficit by refilling spent fees. */
export function backedFeeReserve(available:bigint,commitments:bigint,target:bigint,required:bigint){
 const capacity=available>commitments?available-commitments:BigInt(0);
 if(required>capacity)return required; // A real shortfall remains visible and blocks commitments.
 const desired=target>required?target:required;
 return desired>capacity?capacity:desired;
}
