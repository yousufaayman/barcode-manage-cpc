import React, { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Search, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { JobOrderSummary } from '../services/api';

interface PriorityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobOrders: JobOrderSummary[];
  onSave: (updates: Array<{ job_order_id: number; priority: number }>) => Promise<void>;
}

interface SortableJobOrderItemProps {
  jobOrder: JobOrderSummary;
  index: number;
  isSelected: boolean;
  onSelect: (id: number, selected: boolean) => void;
}

function SortableJobOrderItem({ jobOrder, index, isSelected, onSelect }: SortableJobOrderItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: jobOrder.job_order_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 bg-white border rounded-lg mb-2 cursor-grab active:cursor-grabbing',
        isDragging && 'shadow-lg z-50',
        isSelected && 'bg-blue-50 border-blue-300'
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked) => onSelect(jobOrder.job_order_id, checked as boolean)}
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0"
      />
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0"
      >
        <GripVertical className="h-5 w-5" />
      </div>
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 truncate">
          {jobOrder.job_order_number}
        </div>
        <div className="text-sm text-gray-500 truncate">
          {jobOrder.model_name || 'N/A'} {jobOrder.client_name && `• ${jobOrder.client_name}`}
        </div>
      </div>
      <div className="text-xs text-gray-400">
        Priority: {jobOrder.priority || 0}
      </div>
    </div>
  );
}

export default function PriorityModal({
  open,
  onOpenChange,
  jobOrders,
  onSave,
}: PriorityModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<JobOrderSummary[]>(jobOrders);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  React.useEffect(() => {
    if (open) {
      const sorted = [...jobOrders].sort((a, b) => {
        const priorityA = a.priority || 0;
        const priorityB = b.priority || 0;
        if (priorityB !== priorityA) {
          return priorityB - priorityA;
        }
        return a.job_order_number.localeCompare(b.job_order_number);
      });
      setItems(sorted);
      setSearchQuery('');
      setSelectedIds(new Set());
    }
  }, [open, jobOrders]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;

    const query = searchQuery.toLowerCase();
    return items.filter(
      (jo) =>
        jo.job_order_number.toLowerCase().includes(query) ||
        jo.model_name?.toLowerCase().includes(query) ||
        jo.client_name?.toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const draggedId = active.id as number;
    const isDraggedItemSelected = selectedIds.has(draggedId);

    if (isDraggedItemSelected && selectedIds.size > 1) {
      setItems((items) => {
        const selectedItems = items.filter((item) => selectedIds.has(item.job_order_id));
        const unselectedItems = items.filter((item) => !selectedIds.has(item.job_order_id));
        
        const targetId = over.id as number;
        const targetIndexInUnselected = unselectedItems.findIndex((item) => item.job_order_id === targetId);
        
        if (targetIndexInUnselected === -1) {
          const targetIndexInSelected = selectedItems.findIndex((item) => item.job_order_id === targetId);
          if (targetIndexInSelected !== -1) {
            const draggedIndexInSelected = selectedItems.findIndex((item) => item.job_order_id === draggedId);
            const reorderedSelected = [...selectedItems];
            const draggedItem = reorderedSelected[draggedIndexInSelected];
            reorderedSelected.splice(draggedIndexInSelected, 1);
            reorderedSelected.splice(targetIndexInSelected, 0, draggedItem);
            
            const targetIndexInOriginal = items.findIndex((item) => item.job_order_id === targetId);
            const itemsBeforeTarget = items.slice(0, targetIndexInOriginal);
            const selectedBeforeTarget = itemsBeforeTarget.filter((item) => selectedIds.has(item.job_order_id)).length;
            const insertIndex = targetIndexInOriginal - selectedBeforeTarget;
            unselectedItems.splice(insertIndex, 0, ...reorderedSelected);
            return unselectedItems;
          }
          return items;
        }
        
        const targetIndexInOriginal = items.findIndex((item) => item.job_order_id === targetId);
        const itemsBeforeTarget = items.slice(0, targetIndexInOriginal);
        const selectedBeforeTarget = itemsBeforeTarget.filter((item) => selectedIds.has(item.job_order_id)).length;
        const insertIndex = targetIndexInUnselected;
        unselectedItems.splice(insertIndex, 0, ...selectedItems);
        return unselectedItems;
      });
    } else {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.job_order_id === active.id);
        const newIndex = items.findIndex((item) => item.job_order_id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSelect = (id: number, selected: boolean) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((item) => item.job_order_id)));
    }
  };

  const handleMakeTopPriority = () => {
    if (selectedIds.size === 0) return;
    
    setItems((items) => {
      const selectedItems = items.filter((item) => selectedIds.has(item.job_order_id));
      const unselectedItems = items.filter((item) => !selectedIds.has(item.job_order_id));
      return [...selectedItems, ...unselectedItems];
    });
  };

  const handleDeprioritize = () => {
    if (selectedIds.size === 0) return;
    
    setItems((items) => {
      const selectedItems = items.filter((item) => selectedIds.has(item.job_order_id));
      const unselectedItems = items.filter((item) => !selectedIds.has(item.job_order_id));
      return [...unselectedItems, ...selectedItems];
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates = items.map((jobOrder, index) => ({
        job_order_id: jobOrder.job_order_id,
        priority: items.length - index,
      }));
      await onSave(updates);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save priorities:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[70vw] !max-w-[70vw] !h-[70vh] !max-h-[70vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{t('jobOrders.priority.title', 'Prioritize Job Orders')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="flex gap-2 items-center flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="text"
                placeholder={t('jobOrders.priority.search', 'Search job orders...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
             {filteredItems.length > 0 && (
               <div className="flex gap-2 items-center flex-wrap">
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={handleSelectAll}
                 >
                   {selectedIds.size === filteredItems.length
                     ? t('common.deselectAll', 'Deselect All')
                     : t('common.selectAll', 'Select All')}
                 </Button>
                 {selectedIds.size > 0 && (
                   <>
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={handleMakeTopPriority}
                       className="flex items-center gap-1"
                     >
                       <ArrowUp className="h-4 w-4" />
                       {t('jobOrders.priority.makeTopPriority', 'Make Top Priority')}
                     </Button>
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={handleDeprioritize}
                       className="flex items-center gap-1"
                     >
                       <ArrowDown className="h-4 w-4" />
                       {t('jobOrders.priority.deprioritize', 'Deprioritize')}
                     </Button>
                     <span className="text-sm text-gray-600">
                       {selectedIds.size} {t('common.selected', 'selected')}
                     </span>
                   </>
                 )}
               </div>
             )}
          </div>

          <div className="flex-1 overflow-y-auto pr-2 min-h-0">
            {filteredItems.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {searchQuery
                  ? t('jobOrders.priority.noResults', 'No job orders found')
                  : t('jobOrders.priority.empty', 'No job orders')}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredItems.map((item) => item.job_order_id)}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredItems.map((jobOrder, index) => (
                    <SortableJobOrderItem
                      key={jobOrder.job_order_id}
                      jobOrder={jobOrder}
                      index={index}
                      isSelected={selectedIds.has(jobOrder.job_order_id)}
                      onSelect={handleSelect}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving
              ? t('common.saving', 'Saving...')
              : t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
