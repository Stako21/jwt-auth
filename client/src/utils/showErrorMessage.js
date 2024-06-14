import { enqueueSnackbar } from "notistack";

export default (error) =>
  enqueueSnackbar(error.response.data.error, { variant: "error" });

// import { useSnackbar } from "notistack";

// const showErrorMessage = (error) => {
//   const { enqueueSnackbar } = useSnackbar();
//   const message = error.response?.data?.error || "An error occurred";

//   enqueueSnackbar(message, { variant: "error" });
// };

// export default showErrorMessage;
