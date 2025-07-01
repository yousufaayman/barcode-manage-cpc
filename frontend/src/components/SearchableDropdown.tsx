import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, X, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option && 
    option.toLowerCase() !== 'none' && 
    option.toLowerCase() !== 'null' && 
    option.trim() !== '' &&
    option.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle option selection
  const handleOptionSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearchTerm('');
  };

  // Handle clear selection
  const handleClear = () => {
    onChange('');
    setSearchTerm('');
  };

  return (
    <div className={cn("form-group", className)} ref={dropdownRef}>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <div className="relative">
          <input
            type="text"
            value={isOpen ? searchTerm : value}
            onChange={(e) => {
              if (isOpen) {
                setSearchTerm(e.target.value);
              }
            }}
            onFocus={() => {
              setIsOpen(true);
              setSearchTerm(value);
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="input-field pr-10"
          />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
            {value && !isOpen && (
              <button
                type="button"
                onClick={handleClear}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <ChevronDown 
              className={cn(
                "h-4 w-4 text-gray-400 transition-transform",
                isOpen && "rotate-180"
              )} 
            />
          </div>
        </div>
        
        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option}
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer transition-colors"
                  onClick={() => handleOptionSelect(option)}
                >
                  {option}
                </div>
              ))
            ) : (
              <div className="px-4 py-2 text-gray-500">No options found</div>
            )}
          </div>
        )}
      </div>
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
}

export const EditableDropdown: React.FC<EditableDropdownProps> = ({
  value,
  onValueChange,
  options,
  placeholder = "Select or type...",
  disabled = false,
  className
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [isTyping, setIsTyping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    setIsTyping(true);
    onValueChange(newValue);
  };

  const handleSelect = (selectedValue: string) => {
    setInputValue(selectedValue);
    setIsTyping(false);
    onValueChange(selectedValue);
    setOpen(false);
  };

  const handleInputFocus = () => {
    setIsTyping(true);
    setOpen(true);
  };

  const handleInputBlur = () => {
    // Only close if not clicking on dropdown items
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setIsTyping(false);
        setOpen(false);
      }
    }, 150);
  };

  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(inputValue.toLowerCase())
  );

  const showAddNew = inputValue && !options.includes(inputValue) && isTyping;

  return (
    <div className="relative" ref={containerRef}>
      <input
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />
      <ChevronsUpDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50 pointer-events-none" />
      
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
          <div className="p-2">
            <input
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          
          {showAddNew && (
            <div className="border-t">
              <div
                className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-blue-600 text-sm"
                onClick={() => handleSelect(inputValue)}
              >
                <Plus className="inline mr-2 h-4 w-4" />
                {t('jobOrders.dropdown.addNew', { value: inputValue })}
              </div>
            </div>
          )}
          
          <div className="border-t">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option}
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                  onClick={() => handleSelect(option)}
                >
                  {option}
                </div>
              ))
            ) : (
              <div className="px-4 py-2 text-gray-500 text-sm">
                {t('jobOrders.dropdown.noOptionsFound')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableDropdown; 