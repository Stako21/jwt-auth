import React, { useState } from 'react';
import style from "./Filter.module.scss";

export const Filter = ({ onFilterChange }) => {
  const [selectedFilter, setSelectedFilter] = useState('all');

  const handleChange = (e) => {
    const value = e.target.value;
    setSelectedFilter(value);
    onFilterChange(value); // Сообщаем родительскому компоненту о выбранном фильтре
  };

  return (
    <div className={style.wrapperFilter}>
      <label htmlFor="filter">Фильтр товаров: </label>
      <select id="filter" value={selectedFilter} onChange={handleChange}>
        <option value="all">Весь товар</option>
        <option value="vip">ВІП</option>
        <option value="opt">ОПТ</option>
      </select>
    </div>
  );
};
