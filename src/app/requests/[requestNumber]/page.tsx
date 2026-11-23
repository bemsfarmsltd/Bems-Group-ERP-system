import React from "react";
import { notFound } from "next/navigation";
import { getSsrPageData } from "@/lib/ssr-api";
import { ConnectAppShell } from "@/components/layout/ConnectAppShell";
import { RequestChannelClient } from "./RequestChannelClient";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({
  params
}: {
  params: Promise<{ requestNumber: string }>;
}) {
  const { requestNumber } = await params;
  const { status, data } = await getSsrPageData('request-detail', { requestNumber });
  if (status === 404) notFound();

  return (
    <ConnectAppShell initialSubId={data?.request?.subsidiary?.id}>
      <RequestChannelClient request={data?.request || null} requestNumber={requestNumber} />
    </ConnectAppShell>
  );
}
