"use client";

import type { ComponentProps, ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group";
import { SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";

interface FilterToolbarProps {
  searchLabel: string;
  searchPlaceholder: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  criteria: { key: string; label: string }[];
  onRemove: (key: string) => void;
  onClear: () => void;
  clearDisabled: boolean;
  sortControl?: ReactNode;
}

export function FilterToolbar({ searchLabel, searchPlaceholder, searchQuery, onSearchChange, criteria, onRemove, onClear, clearDisabled, sortControl }: FilterToolbarProps) {
  return <div className="flex w-full flex-col gap-3">
    <div className="flex flex-col gap-3 min-[640px]:flex-row min-[640px]:items-center">
      <InputGroup className="flex-1">
        <InputGroupInput type="search" placeholder={searchPlaceholder} value={searchQuery}
          onChange={event => onSearchChange(event.target.value)} aria-label={searchLabel} />
        <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
      </InputGroup>
      <div className="flex flex-wrap items-center gap-2">
        <SheetTrigger asChild>
          <Button variant="outline" aria-label="Pokaż filtry">
            <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
            Filtry{criteria.length > 0 ? ` (${criteria.length})` : ""}
          </Button>
        </SheetTrigger>
        {sortControl}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {criteria.map(criterion => <Button key={criterion.key} variant="secondary" size="sm"
        aria-label={`Usuń filtr: ${criterion.label}`} onClick={() => onRemove(criterion.key)}>
        {criterion.label}<X data-icon="inline-end" aria-hidden="true" />
      </Button>)}
      <Button variant="ghost" size="sm" onClick={onClear} disabled={clearDisabled}>Wyczyść filtry</Button>
    </div>
  </div>;
}

interface FilterPanelProps {
  title: string;
  submitLabel: string;
  onSubmit: ComponentProps<"form">["onSubmit"];
  onCancel: () => void;
  submitDisabled?: boolean;
  children: ReactNode;
}

export function FilterPanel({ title, submitLabel, onSubmit, onCancel, submitDisabled, children }: FilterPanelProps) {
  return <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-lg md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-dvh md:w-[440px] md:rounded-none md:border-l md:border-t-0">
    <SheetHeader>
      <SheetTitle>{title}</SheetTitle>
      <SheetDescription>Wybierz kryteria i zastosuj je do listy.</SheetDescription>
    </SheetHeader>
    <form onSubmit={onSubmit}>
      {children}
      <SheetFooter>
        <Button type="submit" disabled={submitDisabled}>{submitLabel}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Anuluj</Button>
      </SheetFooter>
    </form>
  </SheetContent>;
}
