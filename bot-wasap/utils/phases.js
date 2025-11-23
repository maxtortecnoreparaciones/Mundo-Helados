// RUTA: utils/phases.js - ACTUALIZADO

const PHASE = {
    // Fases iniciales y de navegación
    SELECCION_OPCION: 'seleccion_opcion',
    BROWSE_IMAGES: 'browse_images',
    SELECCION_PRODUCTO: 'seleccion_producto',

    // Fases de personalización del producto
    SELECT_DETAILS: 'select_details',
    SELECT_QUANTITY: 'select_quantity', // <-- ESTA ES LA FASE QUE FALTABA

    // Fases del proceso de pago (Checkout)
    CHECK_DIR: 'check_dir',
    CHECK_NAME: 'check_name',
<<<<<<< HEAD
    CHECK_TELEFONO: 'check_telefono',
=======
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
    CHECK_PAGO: 'check_pago',
    CONFIRM_ORDER: 'confirm_order',

    // Fases especiales
    ENCARGO: 'encargo'
};

module.exports = PHASE;