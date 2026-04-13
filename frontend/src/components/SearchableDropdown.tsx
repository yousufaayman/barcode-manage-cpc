import React, { useState, useEffect, useMemo, useCallback, useId } from 'react';
import { ChevronDown, X, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { useTranslation } from 'react-i18next';

interface SearchableDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  label: string;
  className?: string;
  disabled?: boolean;
}

const normalize = (s: string) => s.trim().toLowerCase();

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  value,
  onChange,
  options,
  placeholder,
  label,
  className,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const listboxId = useId();

  const filteredOptions = useMemo(() => {
    const q = normalize(searchTerm);
    return options.filter(option => {
      if (!option || option.trim() === '') return false;
      const o = normalize(option);
      if (o === 'none' || o === 'null') return false;
      return o.includes(q);
    });
  }, [options, searchTerm]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (open) {
      setSearchTerm(value);
    } else {
      setSearchTerm('');
    }
  }, [value]);

  const handleOptionSelect = (option: string) => {
    onChange(option);
    handleOpenChange(false);
  };

  const handleClear = () => {
    onChange('');
    setSearchTerm('');
  };

  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      ) : null}
      <Popover open={isOpen} onOpenChange={handleOpenChange} modal={false}>
        <PopoverTrigger asChild>
          <div className="relative w-full">
            <input
              type="text"
              role="combobox"
              aria-controls={listboxId}
              aria-expanded={isOpen}
              value={isOpen ? searchTerm : value}
              onChange={(e) => {
                const next = e.target.value;
                if (isOpen) {
                  setSearchTerm(next);
                } else {
                  setIsOpen(true);
                  setSearchTerm(next);
                }
              }}
              placeholder={placeholder}
              disabled={disabled}
              className={cn(
                'input-field h-10 w-full rounded-lg border border-input bg-background pr-10 text-sm shadow-sm',
                'transition-[box-shadow,border-color] placeholder:text-muted-foreground',
                'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            />
            <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
              {value && !isOpen ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleClear();
                  }}
                  className="pointer-events-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  disabled={disabled}
                  aria-label="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isOpen && 'rotate-180'
                )}
              />
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent
          id={listboxId}
          role="listbox"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'z-50 p-0',
            'w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-1rem,28rem)]',
            'min-w-[max(var(--radix-popover-trigger-width),14rem)]',
            'rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          <div className="max-h-[min(50vh,320px)] overflow-y-auto overscroll-contain py-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="option"
                  className={cn(
                    'flex w-full items-center px-3 py-2.5 text-left text-sm',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus:bg-accent focus:text-accent-foreground focus:outline-none'
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleOptionSelect(option)}
                  aria-selected={value === option}
                >
                  {option}
                </button>
              ))
            ) : (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No options found
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

interface EditableDropdownProps {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** When false, hides the “+ Add …” row. Typing still updates the value (free text). */
  showAddNewOption?: boolean;
}

export const EditableDropdown: React.FC<EditableDropdownProps> = ({
  value,
  onValueChange,
  options,
  placeholder = 'Select or type...',
  disabled = false,
  className,
  showAddNewOption = true,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const listboxId = useId();

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filteredOptions = useMemo(() => {
    const q = normalize(inputValue);
    if (!q) return options;
    return options.filter((option) => normalize(option).includes(q));
  }, [options, inputValue]);

  const showAddNew =
    showAddNewOption &&
    inputValue.trim() &&
    !options.some((o) => normalize(o) === normalize(inputValue));

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    onValueChange(newValue);
  };

  const handleSelect = (selectedValue: string) => {
    setInputValue(selectedValue);
    onValueChange(selectedValue);
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>
        <div className={cn('relative w-full', className)}>
          <input
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            role="combobox"
            aria-controls={listboxId}
            aria-expanded={open}
            className={cn(
              'flex h-10 w-full rounded-lg border border-input bg-background py-2 pl-3 pr-9 text-sm shadow-sm',
              'transition-[box-shadow,border-color] ring-offset-background',
              'placeholder:text-muted-foreground',
              'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          />
          <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-60" />
        </div>
      </PopoverTrigger>
      <PopoverContent
        id={listboxId}
        role="listbox"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className={cn(
          'z-50 p-0',
          'w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-1rem,28rem)]',
          'min-w-[max(var(--radix-popover-trigger-width),14rem)]',
          'rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
        )}
      >
        {showAddNew ? (
          <div className="border-b border-border">
            <button
              type="button"
              role="option"
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-primary',
                'hover:bg-accent focus:bg-accent focus:outline-none'
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(inputValue.trim())}
              aria-selected={false}
            >
              <Plus className="h-4 w-4 shrink-0" />
              {t('jobOrders.dropdown.addNew', { value: inputValue.trim() })}
            </button>
          </div>
        ) : null}
        <div className="max-h-[min(50vh,320px)] overflow-y-auto overscroll-contain py-1">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                className={cn(
                  'flex w-full items-center px-3 py-2.5 text-left text-sm',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus:bg-accent focus:text-accent-foreground focus:outline-none'
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(option)}
                aria-selected={value === option}
              >
                {option}
              </button>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t('jobOrders.dropdown.noOptionsFound')}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default SearchableDropdown;
