import { Suspense } from "react";

import { RecordScreen } from "@/components/record/record-screen";

export default function RecordPage() {
  return (
    <Suspense fallback={null}>
      <RecordScreen />
    </Suspense>
  );
}
