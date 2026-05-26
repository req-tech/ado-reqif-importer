# ReqIF Importer for Azure DevOps

Import requirements from ReqIF (`.reqif` / `.reqifz`) files directly into Azure DevOps Work Items — without leaving the browser.

## Features

- **Upload** `.reqif` or `.reqifz` (zipped ReqIF) files
- **Map** ReqIF Specification Types to Azure DevOps Work Item types and fields
- **Save and reuse** mapping profiles for consistent imports
- **Preview** the import before committing — see exactly what will be created
- **Execute** the import with real-time progress feedback and a detailed report

## Getting Started

1. Open the **ReqIF Importer** hub from the Azure DevOps sidebar
2. Upload a `.reqif` or `.reqifz` file
3. Configure the mapping between ReqIF SpecTypes and your ADO Work Item types
4. Review the preview table to validate field mappings
5. Click **Execute Import** to create Work Items in the selected project

## Supported ReqIF Version

ReqIF 1.2 (OMG specification). String, integer, boolean, enumeration, and date attribute types are supported.

## Requirements

- Azure DevOps Services or Azure DevOps Server 2019+
- Project-level contributor permissions to create Work Items

## Feedback & Issues

Please open an issue in the project repository.
