'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/lib/hooks/useDebounce';
import {
  Search,
  Users,
  Truck,
  FileText,
  FolderOpen,
  PackageSearch,
  Clock,
  X,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const RECENT_SEARCHES_KEY = 'global-search-recent';
const MAX_RECENT = 5;

interface SearchResult {
  id: string;
  name: string;
  type: 'customer' | 'supplier' | 'custom_entity' | 'invoice' | 'inventory';
  subtitle?: string;
  badge?: string;
  href: string;
  balance?: number;
}

const typeConfig: Record<SearchResult['type'], { icon: typeof Users; color: string; bgColor: string }> = {
  customer: { icon: Users, color: 'text-blue-700', bgColor: 'bg-blue-100' },
  supplier: { icon: Truck, color: 'text-purple-700', bgColor: 'bg-purple-100' },
  custom_entity: { icon: FolderOpen, color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  invoice: { icon: FileText, color: 'text-amber-700', bgColor: 'bg-amber-100' },
  inventory: { icon: PackageSearch, color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
};

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === 'undefined' || !query.trim()) return;
  try {
    const recents = getRecentSearches().filter((r) => r !== query);
    recents.unshift(query);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recents.slice(0, MAX_RECENT)));
  } catch {
    // localStorage unavailable
  }
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 2) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 text-inherit rounded-sm px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function GlobalSearch() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debouncedQuery = useDebounce(inputValue, 300);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, [isOpen]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!response.ok) throw new Error('Search failed');
      return response.json() as Promise<{ results: SearchResult[] }>;
    },
    enabled: debouncedQuery.length >= 2,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const results = data?.results ?? [];

  const groupedResults = results.reduce<Record<string, SearchResult[]>>((acc, result) => {
    const group = result.type;
    if (!acc[group]) acc[group] = [];
    acc[group].push(result);
    return acc;
  }, {});

  const flatResults = Object.values(groupedResults).flat();

  const groupLabels: Record<string, string> = {
    customer: 'Customers',
    supplier: 'Suppliers',
    custom_entity: 'Custom Entities',
    invoice: 'Invoices',
    inventory: 'Inventory',
  };

  const handleSelect = useCallback((result: SearchResult) => {
    saveRecentSearch(inputValue);
    setIsOpen(false);
    setInputValue('');
    setSelectedIndex(-1);
    router.push(result.href);
  }, [inputValue, router]);

  const handleRecentClick = useCallback((query: string) => {
    setInputValue(query);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && flatResults[selectedIndex]) {
      e.preventDefault();
      handleSelect(flatResults[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  }, [flatResults, selectedIndex, handleSelect]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [debouncedQuery]);

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-search-item]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const showDropdown = isOpen && (inputValue.length > 0 || recentSearches.length > 0);
  const showResults = debouncedQuery.length >= 2;
  const showLoading = isLoading && debouncedQuery.length >= 2;
  const showSpinner = isFetching && debouncedQuery.length >= 2;

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={`relative flex items-center gap-2 rounded-xl border bg-white px-3 sm:px-4 h-10 sm:h-11 transition-all shadow-sm ${
          isOpen
            ? 'border-slate-400 ring-2 ring-slate-200 shadow-md'
            : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search inventory, customers, suppliers, invoices..."
          className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none min-w-0"
        />
        {showSpinner && (
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />
        )}
        {inputValue && !showSpinner && (
          <button
            type="button"
            onClick={() => {
              setInputValue('');
              inputRef.current?.focus();
            }}
            className="p-0.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 shrink-0">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div ref={listRef} className="max-h-[360px] overflow-y-auto">
            {!showResults && recentSearches.length > 0 && (
              <div className="p-2">
                <p className="px-2 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Recent Searches
                </p>
                {recentSearches.map((query) => (
                  <button
                    key={query}
                    type="button"
                    onClick={() => handleRecentClick(query)}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{query}</span>
                  </button>
                ))}
              </div>
            )}

            {!showResults && inputValue.length > 0 && inputValue.length < 2 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                Type at least 2 characters to search...
              </div>
            )}

            {showLoading && !data && (
              <div className="p-3 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-2">
                    <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showResults && !showLoading && results.length === 0 && (
              <div className="px-4 py-8 text-center">
                <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No results for &ldquo;{debouncedQuery}&rdquo;</p>
                <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
              </div>
            )}

            {showResults && results.length > 0 && (
              <div className="p-1.5">
                {Object.entries(groupedResults).map(([type, items]) => {
                  const config = typeConfig[type as SearchResult['type']];
                  const Icon = config?.icon || FolderOpen;

                  return (
                    <div key={type}>
                      <p className="px-2.5 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        {groupLabels[type] || type}
                      </p>
                      {items.map((result) => {
                        const globalIdx = flatResults.indexOf(result);
                        const isSelected = globalIdx === selectedIndex;

                        return (
                          <button
                            key={result.id}
                            type="button"
                            data-search-item
                            onClick={() => handleSelect(result)}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors group ${
                              isSelected ? 'bg-slate-100' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className={`p-1.5 rounded-lg shrink-0 ${config?.bgColor || 'bg-gray-100'}`}>
                              <Icon className={`w-4 h-4 ${config?.color || 'text-gray-600'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                <HighlightMatch text={result.name} query={debouncedQuery} />
                              </p>
                              {result.subtitle && (
                                <p className="text-xs text-gray-500 truncate mt-0.5">
                                  <HighlightMatch text={result.subtitle} query={debouncedQuery} />
                                </p>
                              )}
                            </div>
                            {result.badge && (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                                result.type === 'invoice'
                                  ? result.badge === 'Paid'
                                    ? 'bg-green-100 text-green-700'
                                    : result.badge === 'Partial'
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-red-100 text-red-700'
                                  : `${config?.bgColor || 'bg-gray-100'} ${config?.color || 'text-gray-600'}`
                              }`}>
                                {result.badge}
                              </span>
                            )}
                            <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {showResults && results.length > 0 && (
            <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between text-[10px] text-gray-400 bg-gray-50/50">
              <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-0.5">
                  <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-white text-[10px]">↑↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-0.5">
                  <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-white text-[10px]">↵</kbd>
                  open
                </span>
                <span className="flex items-center gap-0.5">
                  <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-white text-[10px]">esc</kbd>
                  close
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
