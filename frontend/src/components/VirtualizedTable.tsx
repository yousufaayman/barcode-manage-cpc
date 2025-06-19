import React, { memo, useRef, useEffect, useState } from 'react';
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
  onSelectAll?: () => void;
  isAllSelected?: boolean;
}

const VirtualizedTable: React.FC<VirtualizedTableProps> = ({
  columns,
  data,
  height,
  rowHeight,
  onRowClick,
  selectedItems,
  showAllColumns,
  onSelectAll,
  isAllSelected
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [containerWidth, setContainerWidth] = useState(0);

  // Calculate visible rows based on scroll position
  useEffect(() => {
    const calculateVisibleRange = () => {
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      
      const start = Math.floor(scrollTop / rowHeight);
      const visibleRows = Math.ceil(containerHeight / rowHeight);
      const end = Math.min(start + visibleRows + 1, data.length);
      
      setVisibleRange({ start, end });
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', calculateVisibleRange);
      calculateVisibleRange();
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', calculateVisibleRange);
      }
    };
  }, [data.length, rowHeight]);

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Calculate column widths
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const columnStyles = columns.map(col => ({
    width: `${(col.width / totalWidth) * 100}%`,
    minWidth: col.width
  }));

  // Calculate spacer heights
  const topSpacerHeight = visibleRange.start * rowHeight;
  const bottomSpacerHeight = (data.length - visibleRange.end) * rowHeight;

  return (
    <div 
      ref={containerRef}
      className="w-full overflow-auto"
      style={{ height }}
    >
      <div className="min-w-full">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-50">
          <div className="flex w-full border-b">
            {columns.map((column, index) => (
              <div
                key={column.key}
                style={columnStyles[index]}
                className={cn(
                  "px-4 py-2 font-medium text-sm whitespace-nowrap overflow-hidden text-ellipsis",
                  column.hidden && !showAllColumns && "hidden md:block" // Hide on mobile unless showAllColumns is true
                )}
              >
                {column.key === 'batch_id' && onSelectAll ? (
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={onSelectAll}
                    className="h-4 w-4"
                  />
                ) : (
                  column.header
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Table Body */}
        <div className="relative">
          {/* Top Spacer */}
          <div style={{ height: topSpacerHeight }} />

          {/* Visible Rows */}
          {data.slice(visibleRange.start, visibleRange.end).map((item, index) => {
            const actualIndex = visibleRange.start + index;
            const isSelected = selectedItems?.includes(item.batch_id);

            return (
              <div
                key={item.batch_id}
                className={cn(
                  "flex w-full border-b hover:bg-gray-50",
                  isSelected && "bg-lime bg-opacity-30"
                )}
                style={{ height: rowHeight }}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((column, colIndex) => (
                  <div
                    key={column.key}
                    style={columnStyles[colIndex]}
                    className={cn(
                      "px-4 py-2 text-sm whitespace-nowrap overflow-hidden text-ellipsis",
                      column.hidden && !showAllColumns && "hidden md:block" // Hide on mobile unless showAllColumns is true
                    )}
                  >
                    {column.render ? column.render(item) : item[column.key]}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Bottom Spacer */}
          <div style={{ height: bottomSpacerHeight }} />
        </div>
      </div>
    </div>
  );
};

export default memo(VirtualizedTable); 