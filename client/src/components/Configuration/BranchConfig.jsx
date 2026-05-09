import { useContext, useEffect, useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import { AuthContext } from "../../context/AuthContext";
import {
  createBranchConfig,
  fetchBranchesConfig,
  setBranchConfigActive,
  updateBranchByIdConfig,
} from "../../services/config.api";
import { useAppConfig } from "../../context/AppConfigContext";

const defaultForm = {
  slug: "",
  name: "",
  shortName: "",
  cloneFromCurrentBranch: true,
};

function normalizeForm(branch) {
  if (!branch) return defaultForm;

  return {
    slug: branch.slug || "",
    name: branch.name || "",
    shortName: branch.shortName || "",
    cloneFromCurrentBranch: false,
  };
}

export function BranchConfig() {
  const {
    userInfo,
    reloadUserInfo,
    handleSwitchBranch,
    isSwitchingBranch,
  } = useContext(AuthContext);
  const { reloadConfig } = useAppConfig();
  const { enqueueSnackbar } = useSnackbar();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState({});
  const [createdBranch, setCreatedBranch] = useState(null);

  const currentBranchId = Number(
    userInfo?.currentBranch?.id || userInfo?.branchId || 0,
  );

  const loadBranches = async () => {
    setLoading(true);
    try {
      const nextBranches = await fetchBranchesConfig();
      setBranches(nextBranches);
    } catch (error) {
      console.error("Failed to load branches config:", error);
      enqueueSnackbar("Failed to load branches", { variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const sortedBranches = useMemo(() => {
    return [...branches].sort((a, b) => {
      if (Number(Boolean(b.isActive)) !== Number(Boolean(a.isActive))) {
        return Number(Boolean(b.isActive)) - Number(Boolean(a.isActive));
      }

      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [branches]);

  const validate = () => {
    const nextErrors = {};

    if (!form.slug.trim()) nextErrors.slug = "Required";
    else if (!/^[a-z0-9-]+$/.test(form.slug.trim().toLowerCase())) {
      nextErrors.slug = "Use only a-z, 0-9, and hyphen";
    }

    if (!form.name.trim()) nextErrors.name = "Required";
    if (!form.shortName.trim()) nextErrors.shortName = "Required";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const resetForm = () => {
    setEditingBranchId(null);
    setForm(defaultForm);
    setErrors({});
  };

  const reloadBranchViews = async () => {
    await Promise.all([loadBranches(), reloadConfig(), reloadUserInfo()]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        shortName: form.shortName.trim(),
        templateBranchId:
          !editingBranchId && form.cloneFromCurrentBranch && currentBranchId
            ? currentBranchId
            : null,
      };

      if (editingBranchId) {
        await updateBranchByIdConfig(editingBranchId, payload);
        enqueueSnackbar("Branch updated", { variant: "success" });
      } else {
        const branch = await createBranchConfig(payload);
        setCreatedBranch({
          id: Number(branch.id),
          name: branch.name || branch.shortName || branch.slug,
          clonedFromCurrentBranch: Boolean(payload.templateBranchId),
        });
        enqueueSnackbar("Branch created", { variant: "success" });
      }

      await reloadBranchViews();
      resetForm();
    } catch (error) {
      console.error("Failed to save branch config:", error);
      enqueueSnackbar(
        error.response?.data?.error || "Failed to save branch",
        { variant: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (branch) => {
    setSaving(true);
    try {
      await setBranchConfigActive(branch.id, !branch.isActive);
      enqueueSnackbar(
        branch.isActive ? "Branch deactivated" : "Branch activated",
        { variant: "success" },
      );
      await reloadBranchViews();
      if (editingBranchId === branch.id && branch.isActive) {
        resetForm();
      }
    } catch (error) {
      console.error("Failed to toggle branch active:", error);
      enqueueSnackbar(
        error.response?.data?.error || "Failed to change branch status",
        { variant: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchToCreatedBranch = async () => {
    if (!createdBranch?.id) return;

    try {
      await handleSwitchBranch(createdBranch.id);
      setCreatedBranch(null);
      await reloadBranchViews();
    } catch (error) {
      console.error("Failed to switch to created branch:", error);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div className="columns">
        <div className="column is-7">
          <div className="level mb-3">
            <div className="level-left">
              <div>
                <h3 className="title is-5 mb-1">Branches</h3>
                <p className="is-size-7 has-text-grey">
                  New branches are automatically added to the current admin's
                  branch access.
                </p>
              </div>
            </div>
          </div>

          {createdBranch && Number(createdBranch.id) !== currentBranchId && (
            <div className="notification is-info is-light">
              <div className="content">
                <p className="mb-2">
                  <strong>{createdBranch.name}</strong> was created successfully.
                </p>
                <p className="mb-2">
                  {createdBranch.clonedFromCurrentBranch
                    ? "Switch to it now and review the copied cities, balance pages, and reports."
                    : "Switch to it now and continue setup with cities, balance pages, and reports."}
                </p>
                <div className="buttons">
                  <button
                    type="button"
                    className={`button is-link ${
                      isSwitchingBranch ? "is-loading" : ""
                    }`}
                    onClick={handleSwitchToCreatedBranch}
                    disabled={saving || isSwitchingBranch}
                  >
                    Switch Now
                  </button>
                  <button
                    type="button"
                    className="button is-light"
                    onClick={() => setCreatedBranch(null)}
                    disabled={saving || isSwitchingBranch}
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <p>Loading...</p>
          ) : (
            <div className="table-container">
              <table className="table is-fullwidth is-striped is-hoverable">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Slug</th>
                    <th>Name</th>
                    <th>Short</th>
                    <th>Status</th>
                    <th>Current</th>
                    <th className="has-text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBranches.map((branch) => (
                    <tr key={branch.id}>
                      <td>{branch.id}</td>
                      <td>{branch.slug}</td>
                      <td>{branch.name}</td>
                      <td>{branch.shortName}</td>
                      <td>
                        <span
                          className={`tag ${
                            branch.isActive ? "is-success" : "is-light"
                          }`}
                        >
                          {branch.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        {Number(branch.id) === currentBranchId ? (
                          <span className="tag is-info is-light">Yes</span>
                        ) : (
                          <span className="has-text-grey">-</span>
                        )}
                      </td>
                      <td className="has-text-right">
                        <div className="buttons is-right are-small">
                          <button
                            type="button"
                            className="button is-info"
                            onClick={() => {
                              setEditingBranchId(branch.id);
                              setForm(normalizeForm(branch));
                              setErrors({});
                            }}
                            disabled={saving}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`button ${
                              branch.isActive ? "is-warning" : "is-success"
                            }`}
                            onClick={() => handleToggleActive(branch)}
                            disabled={saving}
                          >
                            {branch.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!sortedBranches.length && (
                    <tr>
                      <td colSpan="7" className="has-text-centered has-text-grey">
                        No branches configured yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="column is-5">
          <h3 className="title is-5">
            {editingBranchId ? "Edit Branch" : "New Branch"}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label">Slug *</label>
              <div className="control">
                <input
                  className={`input ${errors.slug ? "is-danger" : ""}`}
                  value={form.slug}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, slug: e.target.value }))
                  }
                  placeholder="default"
                />
              </div>
              {errors.slug && <p className="help is-danger">{errors.slug}</p>}
            </div>

            <div className="field">
              <label className="label">Full Name *</label>
              <div className="control">
                <input
                  className={`input ${errors.name ? "is-danger" : ""}`}
                  value={form.name}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, name: e.target.value }))
                  }
                  placeholder="Default branch"
                />
              </div>
              {errors.name && <p className="help is-danger">{errors.name}</p>}
            </div>

            <div className="field">
              <label className="label">Short Name *</label>
              <div className="control">
                <input
                  className={`input ${errors.shortName ? "is-danger" : ""}`}
                  value={form.shortName}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      shortName: e.target.value,
                    }))
                  }
                  placeholder="Default"
                />
              </div>
              {errors.shortName && (
                <p className="help is-danger">{errors.shortName}</p>
              )}
            </div>

            {!editingBranchId && (
              <div className="field">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.cloneFromCurrentBranch}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        cloneFromCurrentBranch: e.target.checked,
                      }))
                    }
                    disabled={saving || !currentBranchId}
                  />{" "}
                  Clone cities, balance pages, and reports from the current
                  branch
                </label>
                <p className="help">
                  Import sources and scheduler settings stay global and are not
                  duplicated.
                </p>
              </div>
            )}

            <div className="buttons">
              <button
                type="submit"
                className={`button is-primary ${saving ? "is-loading" : ""}`}
                disabled={saving}
              >
                {editingBranchId ? "Save" : "Create"}
              </button>
              <button
                type="button"
                className="button is-light"
                onClick={resetForm}
                disabled={saving}
              >
                Reset
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
