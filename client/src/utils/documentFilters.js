export function filterDocuments(documents, filters) {
  return documents.filter((doc) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(doc.status)) {
      return false;
    }
    if (filters.contractor && doc.contractor !== filters.contractor) {
      return false;
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
