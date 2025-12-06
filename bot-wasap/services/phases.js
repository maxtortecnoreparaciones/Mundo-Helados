// RUTA: utils/phases.js

const PHASE = {
    SELECCION_OPCION: 'seleccion_opcion',
    BROWSE_IMAGES: 'browse_images',
    SELECCION_PRODUCTO: 'seleccion_producto',
    SELECT_DETAILS: 'select_details',
    SELECT_QUANTITY: 'select_quantity',
    CONFIRM_ORDER: 'confirm_order',
    CHECK_DIR: 'check_dir',
    CHECK_NAME: 'check_name',
    CHECK_TELEFONO: 'check_telefono',
    CHECK_PAGO: 'check_pago',
    FINALIZE_ORDER: 'finalize_order', // <-- Esta era la fase crítica que faltaba
    ENCARGO: 'encargo'
};

module.exports = PHASE;
