import React, { useEffect, useState } from 'react';
import type { MappingProfile } from '../../models/mapping';
import type { TypeMapping } from '../../models/mapping';
import { listProfiles, saveProfile, deleteProfile } from '../../services/storage-service';
import './ProfileSelector.css';

interface Props {
  currentMappings: TypeMapping[];
  onProfileLoaded: (profile: MappingProfile) => void;
}

const ProfileSelector: React.FC<Props> = ({ currentMappings, onProfileLoaded }) => {
  const [profiles, setProfiles] = useState<MappingProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [saveName, setSaveName] = useState<string>('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    listProfiles().then(setProfiles).catch(() => {});
  }, []);

  const handleLoad = () => {
    const profile = profiles.find((p) => p.id === selectedId);
    if (profile) onProfileLoaded(profile);
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    const now = new Date().toISOString();
    const existing = profiles.find((p) => p.displayName === saveName.trim());
    const profile: MappingProfile = {
      id: existing?.id ?? `profile-${Date.now()}`,
      displayName: saveName.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      reqIfIdentifierField: existing?.reqIfIdentifierField ?? 'Custom.ReqIFIdentifier',
      typeMappings: currentMappings,
    };
    await saveProfile(profile);
    const updated = await listProfiles();
    setProfiles(updated);
    setSelectedId(profile.id);
    setSaveName('');
    setShowSaveInput(false);
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    await deleteProfile(selectedId);
    const updated = await listProfiles();
    setProfiles(updated);
    setSelectedId('');
    setConfirmDelete(false);
  };

  return (
    <div className="profile-selector">
      <label htmlFor="profile-dropdown">Saved Profiles</label>
      <div className="profile-row">
        <select
          id="profile-dropdown"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          aria-label="Select saved profile"
        >
          <option value="">— New / unsaved —</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
        <button onClick={handleLoad} disabled={!selectedId} aria-label="Load profile">
          Load
        </button>
        <button
          onClick={() => setShowSaveInput((v) => !v)}
          aria-label="Save profile as"
        >
          Save As…
        </button>
        {selectedId && (
          confirmDelete ? (
            <>
              <span>Delete "{profiles.find((p) => p.id === selectedId)?.displayName}"?</span>
              <button onClick={handleDelete} aria-label="Confirm delete">Yes</button>
              <button onClick={() => setConfirmDelete(false)} aria-label="Cancel delete">No</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} aria-label="Delete profile">
              Delete
            </button>
          )
        )}
      </div>
      {showSaveInput && (
        <div className="profile-save-input">
          <input
            type="text"
            placeholder="Profile name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            aria-label="Profile name"
          />
          <button onClick={handleSave} aria-label="Confirm save profile">
            Save
          </button>
        </div>
      )}
    </div>
  );
};

export default ProfileSelector;
