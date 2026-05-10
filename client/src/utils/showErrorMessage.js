export default (maybeEnqueueOrError, maybeError) => {
  const isFn = typeof maybeEnqueueOrError === "function";
  const enqueue = isFn
    ? maybeEnqueueOrError
    : (msg) => {
        // fallback: log to console if no enqueueSnackbar provided
        console.error(msg);
      };

  const error = isFn ? maybeError : maybeEnqueueOrError;

  if (!error) {
    enqueue("Невідома помилка", { variant: "error" });
    return;
  }

  const message =
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    String(error);

  enqueue(message, { variant: "error" });
};
