import React, { memo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { cn } from '@/lib/utils';

interface Column {
  key: string;
  header: string;
  width: number;
  hidden?: boolean;
  render?: (item: any) => React.ReactNode;
}

interface VirtualizedTableProps {
  columns: Column[];
  data: any[];
  height: number;
  rowHeight: number;
  onRowClick?: (item: any) => void;
  selectedItems?: any[];
  showAllColumns?: boolean;
}

const Row = memo(({ 
  index, 
  style, 
  data: { 
    items, 
    columns, 
    onRowClick, 
    selectedItems,
    showAllColumns 
  } 
}: any) => {
  const item = items[index];
  const isSelected = selectedItems?.includes(item.batch_id);

  return (
    <div
      style={style}
      className={cn(
        "flex items-center border-b hover:bg-gray-50 w-full",
        isSelected && "bg-lime bg-opacity-30"
      )}
      onClick={() => onRowClick?.(item)}
    >
      {columns.map((column: Column, idx: number) => (
        <div
          key={column.key}
          style={{ minWidth: column.width, flex: 1 }}
          className={cn(
            "px-4 py-2 truncate",
            !showAllColumns && column.hidden && "hidden md:table-cell"
          )}
        >
          {column.render ? column.render(item) : item[column.key]}
        </div>
      ))}
    </div>
  );
});

Row.displayName = 'Row';

const VirtualizedTable: React.FC<VirtualizedTableProps> = ({
  columns,
  data,
  height,
  rowHeight,
  onRowClick,
  selectedItems,
  showAllColumns
}) => {
  return (
    <div className="w-full overflow-x-auto">
      {/* Header */}
      <div className="flex items-center border-b bg-gray-50 font-medium sticky top-0 z-10 w-full">
        {columns.map((column) => (
          <div
            key={column.key}
            style={{ minWidth: column.width, flex: 1 }}
            className={cn(
              "px-4 py-2 truncate",
              !showAllColumns && column.hidden && "hidden md:table-cell"
            )}
          >
            {column.header}
          </div>
        ))}
      </div>
      {/* Virtualized List */}
      <div className="w-full">
        <List
          height={height}
          itemCount={data.length}
          itemSize={rowHeight}
          width={"100%"}
          itemData={{
            items: data,
            columns,
            onRowClick,
            selectedItems,
            showAllColumns
          }}
          style={{ width: '100%' }}
        >
          {Row}
        </List>
      </div>
    </div>
  );
};

export default memo(VirtualizedTable); 