import dayjs from "dayjs";
import { isProspectValid } from "@/lib/prospect";

export default async function ProspectsPage() {
  const allProspects = await fetchProspects(); // 既存関数そのまま使う

  const activeProspects = allProspects.filter(isProspectValid);

  const totalCount = activeProspects.length;

  const thisMonthCount = activeProspects.filter(p =>
    dayjs(p.receivedAt ?? p.createdAt).isSame(dayjs(), "month")
  ).length;

  return (
    <div>
      <h1>入居希望</h1>

      <div>
        <p>総件数（2026-01-12 13:49以降）: {totalCount}</p>
        <p>今月の新規: {thisMonthCount}</p>
      </div>

      <ul>
        {activeProspects.map(p => (
          <li key={p.id}>
            {p.name} / {p.receivedAt ?? p.createdAt}
          </li>
        ))}
      </ul>
    </div>
  );
}