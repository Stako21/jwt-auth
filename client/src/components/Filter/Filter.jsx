import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import style from "./Filter.module.scss";

export const Filter = ({ onFilterChange, setLastUpdateTime }) => {
  const [selectedFilter, setSelectedFilter] = useState('all');
  const location = useLocation();

  useEffect(() => {
    setSelectedFilter('all'); // Reset filter to 'all' when the component mounts or location changes
    onFilterChange('all'); // Notify parent component about the reset
  }, [location]);

  const handleChange = (e) => {
    const value = e.target.value;
    setSelectedFilter(value);
    onFilterChange(value); // Сообщаем родительскому компоненту о выбранном фильтре
  };

  return (
    <>
      <div className={style.wrapperFilter}>
        <label htmlFor="filter"></label>
        <select id="filter" value={selectedFilter} onChange={handleChange}>
          <option value="all">Весь товар</option>
          <option value="vip">ВІП</option>
          <option value="opt">ОПТ</option>
        </select>
      </div>
    </>
  );
};
