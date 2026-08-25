import React from "react";
import cn from "classnames";
import style from "./Filter.module.scss";

const FILTER_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "vip", label: "ВІП" },
  { value: "opt", label: "ОПТ" },
];

export const Filter = ({
  searchQuery,
  selectedFilter,
  onSearchChange,
  onFilterChange,
  totalCount,
  visibleCount,
}) => (
  <section className={style.panel} aria-label="Пошук і фільтр залишків">
    <div className={style.controlsRow}>
      <label className={style.searchField} htmlFor="balance-search">
        <span className={style.inputShell}>
          <i className={`fa-solid fa-magnifying-glass ${style.inputIcon}`}></i>
          <input
            id="balance-search"
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Пошук номенклатури..."
            className={style.searchInput}
          />
        </span>
      </label>

      <div className={style.segmentedControl} aria-label="Фільтр товару">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(style.segmentButton, {
              [style.segmentActive]: selectedFilter === option.value,
            })}
            aria-pressed={selectedFilter === option.value}
            onClick={() => onFilterChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className={style.stats} aria-live="polite">
        Показано: <strong>{visibleCount}</strong> / {totalCount}
      </div>
    </div>
  </section>
);
