import React, { useRef, useState } from 'react';
import type { MappingProfile, TypeMapping } from '../../models/mapping';
import { exportProfile, importProfileFromFile } from '../../services/storage-service';
import './ProfileSelector.css';

interface Props {
  currentMappings: TypeMapping[];
  fieldDefaults?: Record<string, string>;
  onProfileLoaded: (profile: MappingProfile) => void;
}

const ProfileSelector: React.FC<Props> = ({ currentMappings, fieldDefaults, onProfileLoaded }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportName, setExportName] = useState<string>('');

  const handleExport = () => {
    const now = new Date().toISOString();
    const profile: MappingProfile = {
      id: `profile-${Date.now()}`,
      displayName: exportName.trim() || 'mapping-config',
      createdAt: now,
      updatedAt: now,
      reqIfIdentifierField: 'Custom.ReqIFIdentifier',
      typeMappings: currentMappings,
      ...(fieldDefaults && Object.keys(fieldDefaults).length > 0 ? { fieldDefaults } : {}),
    };
    exportProfile(profile, exportName.trim() || undefined);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const profile = await importProfileFromFile(file);
      onProfileLoaded(profile);
    } catch (err) {
      setError((err instanceof Error) ? err.message : String(err));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="profile-selector">
      <span className="profile-selector__label">Mapping Config</span>
      <div className="profile-row">
        <input
          type="text"
          className="profile-selector__filename"
          placeholder="File name (optional)"
          value={exportName}
          onChange={(e) => setExportName(e.target.value)}
          aria-label="Export file name"
        />
        <button type="button" onClick={handleExport} aria-label="Export mapping config as JSON">
          ⬇ Export JSON
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Import mapping config from JSON"
        >
          ⬆ Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImport}
          style={{ display: 'none' }}
          aria-label="Select mapping config file"
        />
      </div>
      {error && (
        <div className="profile-selector__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
};

export default ProfileSelector;
