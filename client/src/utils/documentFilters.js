export function filterDocuments(documents, filters) {
  return documents.filter((doc) => {
    if (filters.cityId && String(doc.city_id) !== String(filters.cityId)) {
      return false;
    }
    if (String(filters.documentQuery || "").trim()) {
      const documentQuery = String(filters.documentQuery)
        .trim()
        .toLocaleLowerCase("uk");
      const searchableDocumentNumbers = [
        doc.document_number,
        doc.tro_execution_document_numbers,
        doc.tro_up_document_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("uk");
      if (!searchableDocumentNumbers.includes(documentQuery)) return false;
    }
    if (filters.statuses.length > 0 && !filters.statuses.includes(doc.status)) {
      return false;
    }
    if (filters.contractor) {
      const contractorQuery = String(filters.contractor)
        .trim()
        .toLocaleLowerCase("uk");
      const contractorName = String(doc.contractor || "").toLocaleLowerCase("uk");
      if (!contractorName.includes(contractorQuery)) return false;
    }
    if (filters.authorId && String(doc.author_user_id) !== filters.authorId) {
      return false;
    }
    return true;
  });
}

export function getDocumentAuthorOptions(documents) {
  const uniqueAuthors = new Map();
  documents.forEach((doc) => {
    if (doc.author_user_id && doc.author) {
      uniqueAuthors.set(String(doc.author_user_id), doc.author);
    }
  });

  return [...uniqueAuthors.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, "uk"));
}

export function getDocumentCityOptions(documents) {
  const uniqueCities = new Map();
  documents.forEach((doc) => {
    if (doc.city_id && doc.city_name) {
      uniqueCities.set(String(doc.city_id), {
        id: String(doc.city_id),
        name: doc.city_name,
        branch: doc.branch_short_name || doc.branch_name,
      });
    }
  });
  const cities = [...uniqueCities.values()];
  const nameCounts = new Map();
  cities.forEach((city) => nameCounts.set(city.name, (nameCounts.get(city.name) || 0) + 1));
  return cities
    .map((city) => ({
      id: city.id,
      name: nameCounts.get(city.name) > 1 && city.branch
        ? `${city.name} (${city.branch})`
        : city.name,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "uk"));
}
