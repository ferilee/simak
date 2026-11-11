"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  filterPickerOptions,
  highlightParts,
  type PickerGroup,
  type PickerOption,
} from "../lib/pemilih-cepat";

// Pemilih cepat bersama: pengganti <select> bawaan untuk daftar
// panjang (modul & LKPD pada formulir penugasan). Tertutup tampil
// seperti kolom pilihan biasa; terbuka menampilkan panel menempel di
// bawah kolom berisi kotak pencarian dan daftar bergrup — BUKAN modal
// baru, supaya alur formulir (termasuk di dalam Modal edit) tidak
// bertumpuk lapisan. Semua logika saring/grup murni ada di
// lib/pemilih-cepat.ts; komponen ini hanya menggambar + papan ketik.
//
// Perilaku lipatan: grup collapsedByDefault (arsip) tampil sebagai
// kepala yang bisa diketuk untuk membuka — kecuali saat query
// pencarian tidak kosong: pencarian mengabaikan lipatan dan ikut
// mencari di dalam grup terlipat.
export function PemilihCepat({
  id,
  label,
  placeholder,
  groups,
  value,
  onChange,
  emptyText = "Belum ada pilihan.",
  allowClear = false,
}: {
  id?: string;
  label: string;
  placeholder: string;
  groups: PickerGroup[];
  value: number | null;
  onChange: (id: number | null) => void;
  emptyText?: string;
  /** Tampilkan ✕ pembersih pilihan (hanya untuk kolom yang boleh kosong). */
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const baseId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const listboxId = `${baseId}-listbox`;
  const optionDomId = (optionId: number) => `${baseId}-option-${optionId}`;

  const searching = query.trim().length > 0;

  const selectedOption: PickerOption | null = useMemo(() => {
    if (value === null) return null;
    for (const group of groups) {
      const found = group.options.find((option) => option.id === value);
      if (found) return found;
    }
    return null;
  }, [groups, value]);

  // Grup + butir yang benar-benar terlihat: tersaring oleh query;
  // grup terlipat (tanpa pencarian) hanya menyumbang kepalanya.
  const visibleGroups = useMemo(() => {
    return groups
      .map((group) => {
        const options = filterPickerOptions(group.options, query);
        const collapsed = !searching && Boolean(group.collapsedByDefault) && !(group.label !== null && expanded.has(group.label));
        return { group, options, collapsed };
      })
      .filter(({ group, options }) => {
        if (searching) return options.length > 0;
        return group.options.length > 0;
      });
  }, [groups, query, searching, expanded]);

  const visibleOptions = useMemo(
    () => visibleGroups.flatMap(({ options, collapsed }) => (collapsed ? [] : options)),
    [visibleGroups],
  );
  const totalMatches = useMemo(
    () => visibleGroups.reduce((sum, { options }) => sum + options.length, 0),
    [visibleGroups],
  );

  function close() {
    setOpen(false);
    setQuery("");
    setActiveId(null);
  }

  function openPanel() {
    setOpen(true);
    setActiveId(value ?? null);
  }

  // Klik di luar menutup panel (pola dokumen yang sama dipakai
  // komponen melayang lain: dengarkan pointerdown, bukan blur).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open ]);

  // Fokus ke kotak cari saat panel terbuka — hanya pada perangkat
  // berpenunjuk halus (desktop), supaya papan ketik HP tidak menyela.
  useEffect(() => {
    if (!open) return;
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      searchRef.current?.focus();
    }
  }, [open ]);

  // Sorotan aktif selalu menunjuk butir yang terlihat.
  useEffect(() => {
    if (!open) return;
    if (activeId === null || !visibleOptions.some((option) => option.id === activeId)) {
      setActiveId(visibleOptions[0]?.id ?? null);
    }
  }, [open, activeId, visibleOptions]);

  function moveActive(delta: number) {
    if (visibleOptions.length === 0) return;
    const index = visibleOptions.findIndex((option) => option.id === activeId);
    const next = index === -1
      ? (delta > 0 ? 0 : visibleOptions.length - 1)
      : Math.min(visibleOptions.length - 1, Math.max(0, index + delta));
    setActiveId(visibleOptions[next].id);
    document.getElementById(optionDomId(visibleOptions[next].id))?.scrollIntoView({ block: "nearest" });
  }

  function choose(optionId: number) {
    onChange(optionId);
    close();
  }

  function onSearchKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeId !== null && visibleOptions.some((option) => option.id === activeId)) choose(activeId);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close();
    }
  }

  function toggleGroup(label: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="pemilih-cepat" ref={rootRef}>
      <div className="pemilih-cepat-fieldrow">
        <button
          type="button"
          id={id}
          className="pemilih-cepat-field"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          onClick={() => (open ? close() : openPanel())}
          onKeyDown={(event) => {
            if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              openPanel();
            }
          }}
        >
          <span className={`pemilih-cepat-value${selectedOption ? "" : " is-placeholder"}`}>
            {selectedOption ? selectedOption.title : placeholder}
          </span>
          <span className="pemilih-cepat-chevron" aria-hidden="true">▾</span>
        </button>
        {allowClear && value !== null ? (
          <button
            type="button"
            className="pemilih-cepat-clear"
            aria-label={`Bersihkan pilihan ${label}`}
            onClick={() => onChange(null)}
          >
            ✕
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="pemilih-cepat-panel">
          <input
            ref={searchRef}
            className="pemilih-cepat-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={`Cari ${label.toLowerCase()}…`}
            aria-label={`Cari ${label}`}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={activeId !== null ? optionDomId(activeId) : undefined}
          />
          <div className="pemilih-cepat-list" role="listbox" id={listboxId} aria-label={label}>
            {totalMatches === 0 ? (
              <p className="pemilih-cepat-empty">{searching ? `Tidak ada yang cocok dengan "${query}".` : emptyText}</p>
            ) : (
              visibleGroups.map(({ group, options, collapsed }) => (
                <div key={group.label ?? "__datar__"} className="pemilih-cepat-group">
                  {group.label !== null ? (
                    collapsed || (!searching && group.collapsedByDefault) ? (
                      <button
                        type="button"
                        className="pemilih-cepat-group-toggle"
                        onClick={() => toggleGroup(group.label!)}
                        aria-expanded={!collapsed}
                      >
                        <span>{group.label}</span>
                        <span className="pemilih-cepat-count">
                          {options.length} pilihan {collapsed ? "▸" : "▾"}
                        </span>
                      </button>
                    ) : (
                      <p className="pemilih-cepat-group-label">
                        <span>{group.label}</span>
                        <span className="pemilih-cepat-count">{options.length} pilihan</span>
                      </p>
                    )
                  ) : null}
                  {!collapsed
                    ? options.map((option) => (
                        <button
                          type="button"
                          key={option.id}
                          id={optionDomId(option.id)}
                          role="option"
                          aria-selected={option.id === value}
                          className={`pemilih-cepat-option${option.id === activeId ? " is-active" : ""}${option.id === value ? " is-selected" : ""}`}
                          onClick={() => choose(option.id)}
                          onMouseEnter={() => setActiveId(option.id)}
                        >
                          <span className="pemilih-cepat-check" aria-hidden="true">{option.id === value ? "✓" : ""}</span>
                          <span className="pemilih-cepat-title">
                            {highlightParts(option.title, query).map((part, index) =>
                              part.match ? <mark key={index} className="pemilih-cepat-mark">{part.text}</mark> : <span key={index}>{part.text}</span>,
                            )}
                          </span>
                          {group.badge ? <span className="pemilih-cepat-badge">{group.badge}</span> : null}
                        </button>
                      ))
                    : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
