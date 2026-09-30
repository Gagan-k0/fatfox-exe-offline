# Next Steps: Step 9 Setup Wizard + Final Seed Polish

## Goals:
1. Implement setup endpoints for initial configuration
2. Finalize default data seeding functionality
3. Ensure configuration persistence mechanism
4. Prepare for Step 10 Final QA + Electron Packaging

## Tasks:

### 1. Setup Wizard Implementation
- Review existing setup endpoint in auth.controller.js (setup function)
- Ensure it properly creates restaurant, admin user, default tax brackets, kitchen department, counters
- Verify it returns appropriate success response with user data and token
- Add any missing validation or error handling as needed

### 2. Seed Data Enhancement
- Review helpers/seed.js for completeness
- Ensure it creates:
  - One restaurant (FatFox Offline)
  - One admin user (username from env or 'admin')
  - Default GST brackets (5%, 12%, 18%, 28%)
  - Payment modes (if not already in system)
  - Kitchen department (GENERAL)
  - Order counters (pickup and order sequences)
- Consider adding default menu items or categories for better out-of-box experience
- Ensure seed data is idempotent (safe to run multiple times)

### 3. Configuration Persistence
- Verify that configuration (restaurant settings, taxes, etc.) persists properly
- Check that NeDB storage location is appropriate for offline Windows EXE
- Ensure dataDir in offline-db-adapter.js uses correct path (APPDATA/FatFox Admin/data)
- Consider adding backup/export functionality for configuration

### 4. Integration Testing Preparation
- Prepare for comprehensive testing of all modules working together
- Consider creating end-to-end test scenarios:
  - Initial setup → login → create menu items → create orders → process payments → view reports
- Ensure all API endpoints work correctly in offline mode

## Files to Review/Modify:
- controllers/auth.controller.js (setup function)
- helpers/seed.js
- helpers/offline-db-adapter.js (dataDir path verification)
- models/ (ensure all models have proper indexes)
- routes/ (ensure all necessary routes are defined)

## Verification Checklist:
- [ ] Setup endpoint creates restaurant if none exists
- [ ] Setup endpoint returns proper JWT token and user data
- [ ] Seed data includes restaurant, admin, taxes, kitchen dept, counters
- [ ] Seed data is idempotent (no duplicates on re-run)
- [ ] All modules (auth, menu, pickup, dinein, kds, finance) initialize correctly
- [ ] NeDB storage location is appropriate for Windows EXE
- [ ] Configuration persists between application restarts

## After Completion:
Proceed to Step 10: Final QA + Electron Packaging
- Comprehensive testing of all offline functionality
- Electron app build and packaging
- Creating standalone Windows EXE
- Final validation of offlinemode.md requirements