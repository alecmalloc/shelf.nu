import { Th } from "~/components/table";
import type { Column } from "~/modules/asset-index-settings/helpers";
import { parseColumnName } from "~/modules/asset-index-settings/helpers";

export function AdvancedTableHeader({ columns }: { columns: Column[] }) {
  return (
    <>
      {columns
        .filter((column) => column.visible)
        .map((column) => (
          <Th
            key={column.name}
            className="whitespace-nowrap"
            data-column-name={column.name}
          >
            {parseColumnName(column.name)}
          </Th>
        ))}
    </>
  );
}
