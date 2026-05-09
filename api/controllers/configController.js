import ErrorsUtils from "../utils/Errors.js";
import {
  createBalancePage,
  createBranch,
  createCity,
  getAppConfig,
  getBranchesConfig,
  getUserAccessConfig,
  getUserAccessOptions,
  getBalancePagesForBranch,
  getCitiesForBranch,
  getCurrentBranch,
  getImportSources,
  getReportsForBranch,
  setUserAccessConfig,
  setBranchActive,
  setBalancePageActive,
  setCityActive,
  setImportSourceActive,
  setReportDefinitionActive,
  updateBranch,
  updateImportSource,
  updateReportDefinition,
  updateBalancePage,
  updateCurrentBranch,
  updateCity,
} from "../services/appConfig.service.js";

export async function getConfig(req, res) {
  try {
    const config = await getAppConfig(req.user);
    res.json(config);
  } catch (error) {
    console.error("getConfig error:", error);
    res.status(500).json({ message: "Failed to load app configuration" });
  }
}

export async function getBranchController(req, res) {
  try {
    const branch = await getCurrentBranch(req.user);
    res.json({ branch });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function updateBranchController(req, res) {
  try {
    const branch = await updateCurrentBranch(req.user, req.body);
    res.json({ branch });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function getBranchesController(req, res) {
  try {
    const branches = await getBranchesConfig();
    res.json({ branches });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function createBranchController(req, res) {
  try {
    const branch = await createBranch(req.user, req.body);
    res.status(201).json({ branch });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function updateBranchByIdController(req, res) {
  try {
    const branch = await updateBranch(Number(req.params.id), req.body);
    res.json({ branch });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function setBranchActiveController(req, res) {
  try {
    const branch = await setBranchActive(
      req.user,
      Number(req.params.id),
      Boolean(req.body?.isActive),
    );
    res.json({ branch });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function getCities(req, res) {
  try {
    const cities = await getCitiesForBranch(req.user);
    res.json({ cities });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function createCityController(req, res) {
  try {
    const city = await createCity(req.user, req.body);
    res.status(201).json({ city });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function updateCityController(req, res) {
  try {
    const city = await updateCity(req.user, Number(req.params.id), req.body);
    res.json({ city });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function setCityActiveController(req, res) {
  try {
    const city = await setCityActive(
      req.user,
      Number(req.params.id),
      Boolean(req.body?.isActive),
    );
    res.json({ city });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function getBalancePages(req, res) {
  try {
    const balancePages = await getBalancePagesForBranch(req.user);
    res.json({ balancePages });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function createBalancePageController(req, res) {
  try {
    const balancePage = await createBalancePage(req.user, req.body);
    res.status(201).json({ balancePage });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function updateBalancePageController(req, res) {
  try {
    const balancePage = await updateBalancePage(
      req.user,
      Number(req.params.id),
      req.body,
    );
    res.json({ balancePage });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function setBalancePageActiveController(req, res) {
  try {
    const balancePage = await setBalancePageActive(
      req.user,
      Number(req.params.id),
      Boolean(req.body?.isActive),
    );
    res.json({ balancePage });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function getReports(req, res) {
  try {
    const reports = await getReportsForBranch(req.user);
    res.json({ reports });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function updateReportController(req, res) {
  try {
    const report = await updateReportDefinition(
      req.user,
      Number(req.params.id),
      req.body,
    );
    res.json({ report });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function setReportActiveController(req, res) {
  try {
    const report = await setReportDefinitionActive(
      req.user,
      Number(req.params.id),
      Boolean(req.body?.isActive),
    );
    res.json({ report });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function getImportSourcesController(req, res) {
  try {
    const sources = await getImportSources();
    res.json({ sources });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function getUserAccessOptionsController(req, res) {
  try {
    const data = await getUserAccessOptions(req.user);
    res.json(data);
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function getUserAccessController(req, res) {
  try {
    const access = await getUserAccessConfig(req.user, Number(req.params.id));
    res.json({ access });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function updateUserAccessController(req, res) {
  try {
    const access = await setUserAccessConfig(
      req.user,
      Number(req.params.id),
      req.body,
    );
    res.json({ access });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function updateImportSourceController(req, res) {
  try {
    const source = await updateImportSource(Number(req.params.id), req.body);
    res.json({ source });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function setImportSourceActiveController(req, res) {
  try {
    const source = await setImportSourceActive(
      Number(req.params.id),
      Boolean(req.body?.isActive),
    );
    res.json({ source });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}
