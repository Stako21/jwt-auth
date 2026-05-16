import React from "react";
import style from "./Filter.module.scss";

export const Filter = ({
  searchQuery,
  selectedFilter,
  onSearchChange,
  onFilterChange,
  totalCount,
  visibleCount,
}) => {
  return (
    <section className={style.panel}>
      <div className={style.panelTop}>
        <div>
          <p className={style.eyebrow}>Навігація по залишках</p>
          <h2 className={style.title}>Пошук і швидкий фільтр</h2>
        </div>

        <div className={style.stats}>
          <span className={style.statChip}>Показано: {visibleCount}</span>
          <span className={style.statChipMuted}>Усього позицій: {totalCount}</span>
        </div>
      </div>

      <div className={style.controlsRow}>
        <label className={style.searchField} htmlFor="balance-search">
          <span className={style.fieldLabel}>Пошук</span>
          <span className={style.inputShell}>
            <i className={`fa-solid fa-magnifying-glass ${style.inputIcon}`}></i>
            <input
              id="balance-search"
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Назва товару або групи"
              className={style.searchInput}
            />
          </span>
        </label>

        <label className={style.selectField} htmlFor="balance-filter">
          <span className={style.fieldLabel}>Фільтр</span>
          <div className={style.selectShell}>
            <select
              id="balance-filter"
              value={selectedFilter}
              onChange={(event) => onFilterChange(event.target.value)}
              className={style.selectControl}
            >
              <option value="all">Увесь товар</option>
              <option value="vip">ВІП</option>
              <option value="opt">ОПТ</option>
            </select>
          </div>
        </label>
      </div>
    </section>
  );
};
