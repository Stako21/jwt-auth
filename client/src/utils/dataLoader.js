import * as XLSX from 'xlsx';

export const loadData = async (fileName) => {
  try {
    const filePath = `/Sorce/${fileName}`;
    const response = await fetch(filePath);
    
    if (!response.ok) throw new Error('Failed to fetch file');

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 11 });
    
    const hierarchy = buildHierarchy(rawData); 
    return hierarchy;
  } catch (error) {
    console.error('Error loading data:', error);
    return [];
  }
};