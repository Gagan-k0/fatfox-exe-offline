'use strict';

const express = require('express');
const router = express.Router();
const apiResponse = require('../helpers/apiResponse');

const auth = require('../controllers/auth.controller');
const authenticate = require('../middlewares/jwt');

const categoryCntrl = require('../controllers/category.controller');
const taxCntrl = require('../controllers/tax.controller');
const discountCntrl = require('../controllers/discount.controller');
const tableAreaCntrl = require('../controllers/table_area.controller');
const tableCntrl = require('../controllers/table.controller');
const menuItemsCntrl = require('../controllers/menuItems.controller');
const variantCntrl = require('../controllers/variant.controller');
const addonCntrl = require('../controllers/addon.controller');
const pickupCntrl = require('../controllers/pickup.controller');
const dineinCntrl = require('../controllers/dinein.controller');
const kdsCntrl = require('../controllers/kds.controller');
const financeCntrl = require('../controllers/finance.controller');
const { getPermission } = require('../controllers/permissions.controller');

router.get('/offline-status', (_req, res) => {
  return apiResponse.successResponseWithData(res, 0, 'OK', {
    offline: true,
    ready: true,
    phases: {
      foundation: true,
      auth: true,
      menu: true,
      config: true,
      pickup: true,
      dinein: true,
      kds: false,
      finance: false
    }
  });
});

router.post('/login', auth.login);
router.post('/staff-login', auth.staffLogin);
router.post('/manager-login', auth.managerLogin);
router.post('/setup', auth.setup);
router.get('/setup-status', auth.setupStatus);
router.get('/me', authenticate, auth.me);

// Minimal permission endpoint for offline UI.
router.get('/permission', authenticate, getPermission);

// Menu (Phase 3) — Category
router.post('/category', authenticate, categoryCntrl.create);
router.get('/category', authenticate, categoryCntrl.list);
router.get('/category/active-all', authenticate, categoryCntrl.list);
router.get('/category/view/:id', authenticate, categoryCntrl.view);
router.patch('/category/update/:id', authenticate, categoryCntrl.update);
router.patch('/category/update-status/:id', authenticate, categoryCntrl.updateStatus);
router.delete('/category/delete/:id', authenticate, categoryCntrl.delete);

// STEP 4 — Taxes
router.post('/tax', authenticate, taxCntrl.create);
router.get('/tax', authenticate, taxCntrl.list);
router.get('/tax/settax', authenticate, taxCntrl.setTax);
router.get('/tax/view/:id', authenticate, taxCntrl.view);
router.patch('/tax/update/:id', authenticate, taxCntrl.update);
router.delete('/tax/delete/:id', authenticate, taxCntrl.delete);

// Step 4 — Discounts
router.get('/discount', authenticate, discountCntrl.list);
router.get('/discount/all', authenticate, discountCntrl.listAll);
router.get('/discount/avaliable', authenticate, discountCntrl.listAllAvaliable);
router.post('/discount', authenticate, discountCntrl.create);
router.get('/discount/view/:id', authenticate, discountCntrl.view);
router.patch('/discount/update/:id', authenticate, discountCntrl.update);
router.delete('/discount/delete/:id', authenticate, discountCntrl.delete);

// Step 4 — Table Area
router.post('/restaurant/table/area', authenticate, tableAreaCntrl.createArea);
router.get('/restaurant/table/area', authenticate, tableAreaCntrl.listArea);
router.get('/restaurant/table/area/all', authenticate, tableAreaCntrl.listAllArea);
router.get('/restaurant/table/area/all-avaliable', authenticate, tableAreaCntrl.listAllAvaliableArea);
router.get('/restaurant/table/area/view/:id', authenticate, tableAreaCntrl.viewArea);
router.patch('/restaurant/table/area/update/:id', authenticate, tableAreaCntrl.updateArea);
router.delete('/restaurant/table/area/delete/:id', authenticate, tableAreaCntrl.deleteArea);
router.get('/restaurant/table/area/listtablesforthearea/:id', authenticate, tableAreaCntrl.listTablesForTheArea);
router.get('/restaurant/table/area/listalltablesforalltheareas', authenticate, tableAreaCntrl.listTablesForAllTheAreas);

// Step 4 — Table
router.post('/restaurant/table/:area_id', authenticate, tableCntrl.createTable);
router.get('/restaurant/table', authenticate, tableCntrl.listTable);
router.get('/restaurant/table/all', authenticate, tableCntrl.listAllTable);
router.get('/restaurant/table/all-avaliable', authenticate, tableCntrl.listAllAvaliableTable);
router.get('/restaurant/table/all-avaliable-by-area', authenticate, tableCntrl.listAllAvaliableTableByArea);
router.get('/restaurant/table/view/:id', authenticate, tableCntrl.viewTable);
router.patch('/restaurant/table/update/:id', authenticate, tableCntrl.updateTable);
router.delete('/restaurant/table/delete/:id', authenticate, tableCntrl.deleteTable);

// Step 4 — Menu Items
router.post('/restaurant/menu/menucreatenew', authenticate, menuItemsCntrl.create);
router.get('/restaurant/menu/getallmenu', authenticate, menuItemsCntrl.list);
router.get('/restaurant/menu/all', authenticate, menuItemsCntrl.listAll);
router.get('/restaurant/menu/view-menu/:id', authenticate, menuItemsCntrl.view);
router.patch('/restaurant/menu/updatemenu/:id', authenticate, menuItemsCntrl.update);
router.delete('/restaurant/menu/deletemenu/:id', authenticate, menuItemsCntrl.delete);
router.patch('/restaurant/menu/updatemenu/:id', authenticate, menuItemsCntrl.updateStatus);
router.get('/restaurant/menu/all-images', authenticate, menuItemsCntrl.getAllImages);
router.get('/restaurant/menu/by-category/:categoryId', authenticate, menuItemsCntrl.filterByCategory);
router.get('/restaurant/menu/by-category-paginate', authenticate, menuItemsCntrl.filterByCategoryPaginate);
router.get('/restaurant/menu/by-category-itemin', authenticate, menuItemsCntrl.getFavoriteMenuItems);
router.post('/restaurant/menu/favorite', authenticate, menuItemsCntrl.addFavoriteMenu);
router.delete('/restaurant/menu/favorite/:menu_id', authenticate, menuItemsCntrl.removeFavoriteMenu);

// Step 4 — Variants
router.post('/restaurant/variant', authenticate, variantCntrl.create);
router.get('/restaurant/variant', authenticate, variantCntrl.list);
router.get('/restaurant/variant/all', authenticate, variantCntrl.listAll);
router.get('/restaurant/variant/view/:id', authenticate, variantCntrl.view);
router.patch('/restaurant/variant/update/:id', authenticate, variantCntrl.update);
router.delete('/restaurant/variant/delete/:group_id/:id', authenticate, variantCntrl.delete);
router.patch('/restaurant/variant/update-status/:id', authenticate, variantCntrl.updateStatus);
router.get('/restaurant/variant-group', authenticate, variantCntrl.listGroup);

// Step 4 — Addons
router.post('/restaurant/add-on/addoncreatenew', authenticate, addonCntrl.create);
router.get('/restaurant/add-on/getalladdons', authenticate, addonCntrl.list);
router.get('/restaurant/add-on/all', authenticate, addonCntrl.listAll);
router.get('/restaurant/add-on/getparticularaddon/:id', authenticate, addonCntrl.view);
router.patch('/restaurant/add-on/updateaddon/:id', authenticate, addonCntrl.update);
router.delete('/restaurant/add-on/deleteaddon/:id', authenticate, addonCntrl.delete);
router.get('/restaurant/add-on/all-avaliable', authenticate, addonCntrl.getAvailable);

// STEP 5 — Pickup POS
router.post('/restaurant/pickup', authenticate, pickupCntrl.create);
router.get('/restaurant/pickup', authenticate, pickupCntrl.list);
router.get('/restaurant/pickup/all', authenticate, pickupCntrl.listAll);
router.get('/restaurant/pickup/view/:id', authenticate, pickupCntrl.view);
router.patch('/restaurant/pickup/update/:id', authenticate, pickupCntrl.update);
router.delete('/restaurant/pickup/delete/:id', authenticate, pickupCntrl.delete);
router.patch('/restaurant/pickup/update-status/:id', authenticate, pickupCntrl.updateStatus);
router.get('/restaurant/pickup/transaction/:transactionId', authenticate, pickupCntrl.getByTransactionId);
router.post('/restaurant/pickup/with-transaction', authenticate, pickupCntrl.createWithTransaction);

// STEP 6 — Dine-In POS
router.post('/restaurant/dinein', authenticate, dineinCntrl.create);
router.get('/restaurant/dinein', authenticate, dineinCntrl.list);
router.get('/restaurant/dinein/all', authenticate, dineinCntrl.listAll);
router.get('/restaurant/dinein/view/:id', authenticate, dineinCntrl.view);
router.patch('/restaurant/dinein/update/:id', authenticate, dineinCntrl.update);
router.delete('/restaurant/dinein/delete/:id', authenticate, dineinCntrl.delete);
router.patch('/restaurant/dinein/update-status/:id', authenticate, dineinCntrl.updateStatus);
router.post('/restaurant/dinein/:sessionId/order', authenticate, dineinCntrl.createOrder);
router.get('/restaurant/dinein/:sessionId/orders', authenticate, dineinCntrl.getOrdersForSession);
router.patch('/restaurant/dinein/:sessionId/close', authenticate, dineinCntrl.closeSession);

// STEP 7 — KDS
router.get('/restaurant/kds', authenticate, kdsCntrl.list);
router.get('/restaurant/kds/all', authenticate, kdsCntrl.listAll);
router.get('/restaurant/kds/view/:id', authenticate, kdsCntrl.view);
router.patch('/restaurant/kds/update/:id', authenticate, kdsCntrl.update);
router.delete('/restaurant/kds/delete/:id', authenticate, kdsCntrl.delete);
router.patch('/restaurant/kds/update-status/:id', authenticate, kdsCntrl.updateStatus);
router.post('/restaurant/kds/create-from-order/:orderId', authenticate, kdsCntrl.createFromOrder);
router.get('/restaurant/kds/by-order/:orderId', authenticate, kdsCntrl.getByOrderId);

// STEP 8 — Finance/Reports
router.post('/restaurant/transactions', authenticate, financeCntrl.createTransaction);
router.get('/restaurant/transactions', authenticate, financeCntrl.list);
router.get('/restaurant/transactions/all', authenticate, financeCntrl.listAll);
router.get('/restaurant/transactions/view/:id', authenticate, financeCntrl.view);
router.patch('/restaurant/transactions/update/:id', authenticate, financeCntrl.update);
router.delete('/restaurant/transactions/delete/:id', authenticate, financeCntrl.delete);
router.get('/restaurant/transactions/export', authenticate, financeCntrl.exportCsv);
router.get('/restaurant/reports/item-sales', authenticate, financeCntrl.itemSales);
router.get('/restaurant/reports/daily-sales-report', authenticate, financeCntrl.dailySalesReport);
router.get('/restaurant/reports/monthly-sales-report', authenticate, financeCntrl.monthlySalesReport);

module.exports = router;