from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
import unicodedata
import json
import gspread
from google.oauth2 import service_account
from datetime import datetime
import Levenshtein
from .models import Producto
import os
import tempfile
import base64

# Resolve SERVICE_ACCOUNT_FILE: prefer env path, then base64 JSON, then default file
def _get_service_account_file():
    env_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
    if env_path:
        return env_path

    sa_b64 = os.environ.get('GOOGLE_SERVICE_ACCOUNT_B64') or os.environ.get('GOOGLE_SERVICE_ACCOUNT')
    if sa_b64:
        try:
            data = base64.b64decode(sa_b64)
        except Exception:
            data = sa_b64.encode('utf8')
        tf = tempfile.NamedTemporaryFile(delete=False, suffix='.json')
        tf.write(data)
        tf.flush()
        return tf.name

    # fallback to project-local file
    return settings.BASE_DIR / 'service_account.json'

# --- Configuración de la API de Google Sheets ---
SERVICE_ACCOUNT_FILE = _get_service_account_file()
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
creds = service_account.Credentials.from_service_account_file(
    SERVICE_ACCOUNT_FILE, scopes=SCOPES
)
client = gspread.authorize(creds)

# ID de la hoja de cálculo de PRODUCTOS, SABORES Y TOPPINGS
PRODUCTS_SHEET_ID = '10twtfwsAbyxZ4D_0ChD34oFkwa_EWKAWPGVfk1FdEHM'

# ID de la hoja de cálculo de ENTREGAS
DELIVERIES_SHEET_ID = '1479sKgwA2ES503noFusdM-rOYv412-ogcqEouI6zQgI'

# ---------- Helpers de normalización ----------
def _strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', (s or '')) if unicodedata.category(c) != 'Mn')

def _norm(s: str) -> str:
    s = _strip_accents(s or '')
    return ' '.join(s.lower().strip().split())

# ---------- Funciones de la API de Google Sheets ----------
def _get_sheet_data(sheet_id, sheet_name):
    try:
        sheet = client.open_by_key(sheet_id).worksheet(sheet_name)
        data = sheet.get_all_values()
        if not data:
            return None
        headers = data[0]
        records = [dict(zip(headers, row)) for row in data[1:]]
        return records
    except Exception as e:
        print(f"Error al obtener datos de '{sheet_name}': {e}")
        return None

def obtener_inventario():
    data = _get_sheet_data(PRODUCTS_SHEET_ID, 'Productos')
    if not data:
        return None
    productos = [row for row in data if _norm(row.get('Categoria', '')) not in ['sabores_helado', 'toppings']]
    return productos

def obtener_sabores_y_toppings():
    data = _get_sheet_data(PRODUCTS_SHEET_ID, 'Productos')
    if not data:
        return None
    sabores = [row for row in data if _norm(row.get('Categoria', '')) == 'sabores_helado']
    toppings = [row for row in data if _norm(row.get('Categoria', '')) == 'toppings']
    return {"sabores": sabores, "toppings": toppings}


def agregar_entrega(data):
    try:
        sheet = client.open_by_key(DELIVERIES_SHEET_ID).worksheet('Entregas')
        
        # Obtenemos la fecha y hora actuales
        fecha_actual = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # Creamos la fila con los datos en el orden correcto
        row = [
            fecha_actual,
            data.get('nombre', ''),
            data.get('producto', ''),
            data.get('codigo', ''),
            data.get('telefono', ''),
            data.get('direccion', ''),
            data.get('monto', 0),
            data.get('pago', ''),
            data.get('estado', ''),
            data.get('observaciones', ''),
            data.get('referido_por', '')
        ]
        
        sheet.append_row(row, value_input_option='USER_ENTERED')
        return True, "Entrega registrada con éxito."
    except Exception as e:
        return False, str(e)

def marcar_pago(codigo, pagado):
    return True, "Estado de pago actualizado."

def marcar_entrega(codigo, entregado):
    return True, "Estado de entrega actualizado."

# ---------- Vistas de la API ----------

@csrf_exempt
def consultar_productos_gsheet(request):
    inv_raw = obtener_inventario()
    if not inv_raw:
        return JsonResponse({'error': 'No se pudieron obtener los datos de los productos.'}, status=500)
    
    limit = int(request.GET.get('limit', '0') or 0)
    q_categoria = _norm(request.GET.get('categoria', ''))
    q_producto = _norm(request.GET.get('producto', ''))
    debug = request.GET.get('debug', '') == '1'

    normalized = []
    for it in inv_raw:
        codigo = str(it.get('CodigoProducto', '')).strip()
        nombre = str(it.get('NombreProducto', '')).strip()
        precio = it.get('Precio_Venta', 0)
        categoria = str(it.get('Categoria', '')).strip()
        num_sabores = int(it.get('Numero_de_Sabores', 0) or 0)
        num_toppings = int(it.get('Numero_de_Toppings', 0) or 0)
        
        normalized.append({
            'nombre': nombre,
            'codigo': codigo,
            'precio': precio,
            'categoria': categoria,
            'numSabores': num_sabores,
            'numToppings': num_toppings,
        })

    out = []
    for it in normalized:
        cat_ok = True
        if q_categoria and q_categoria != 'todas':
            cat_ok = (q_categoria in _norm(it['categoria'])) or (q_categoria in _norm(it['nombre']))

        prod_ok = True
        if q_producto:
            prod_ok = (q_producto in _norm(it['nombre']))

        if cat_ok and prod_ok:
            out.append(it)

    if limit and limit > 0:
        out = out[:limit]

    if debug:
        return JsonResponse({
            'query': {
                'categoria': q_categoria, 'producto': q_producto, 'limit': limit
            },
            'counts': {
                'raw': len(inv_raw), 'normalized': len(normalized), 'filtered': len(out)
            },
            'sample_raw': inv_raw[:5],
            'sample_normalized': normalized[:5],
            'result': out[:5]
        }, safe=False)

    return JsonResponse(out, safe=False)

@csrf_exempt
def consultar_stock(request, codigo):
    inv_raw = obtener_inventario()
    if not inv_raw:
        return JsonResponse({'error': 'No se pudieron obtener los datos del inventario.'}, status=500)

    code_q = _norm(codigo)
    for it in inv_raw:
        code_val = _norm(str(it.get('CodigoProducto', '')))
        if code_val == code_q:
            return JsonResponse({
                'nombre': it.get('NombreProducto', ''),
                'stock': it.get('Stock_Actual', ''),
                'precio': it.get('Precio_Venta', 0),
            })
    return JsonResponse({'error': 'Producto no encontrado'}, status=404)

@csrf_exempt
def _norm(text):
    """Normaliza el texto para la búsqueda."""
    return text.lower().strip().replace(" ", "")

def buscar_producto_por_nombre(request):
    query = request.GET.get('q', '').strip()
    if not query:
        return JsonResponse({'error': 'Falta el parámetro de búsqueda "q"'}, status=400)

    inv_raw = obtener_inventario()
    if not inv_raw:
        return JsonResponse({'error': 'No se pudo obtener el inventario de Google Sheets.'}, status=500)

    sabores_y_toppings_data = obtener_sabores_y_toppings()
    if not sabores_y_toppings_data:
        return JsonResponse({'error': 'No se pudieron cargar los sabores y toppings.'}, status=500)

    # Normalizar la consulta del usuario y dividirla en palabras clave
    query_normalized = _norm(query)
    query_words = query_normalized.split()

    matched_products = []

    for producto in inv_raw:
        nombre_normalized = _norm(producto.get('NombreProducto', ''))
        codigo_normalized = _norm(producto.get('CodigoProducto', ''))
        
        # Verificar si TODAS las palabras clave del usuario se encuentran en el nombre del producto
        if all(word in nombre_normalized for word in query_words) or query_normalized in codigo_normalized:
            matched_products.append(producto)

    if not matched_products:
        return JsonResponse({'error': 'Producto no encontrado.'}, status=404)
    elif len(matched_products) == 1:
        producto_encontrado = matched_products[0]
        producto_encontrado['sabores'] = sabores_y_toppings_data.get('sabores', [])
        producto_encontrado['toppings'] = sabores_y_toppings_data.get('toppings', [])
        return JsonResponse(producto_encontrado)
    else:
        return JsonResponse({'matches': matched_products})

@csrf_exempt
def consultar_sabores_y_toppings(request):
    data = obtener_sabores_y_toppings()
    if data:
        return JsonResponse(data)
    
    return JsonResponse({'error': 'No se pudieron obtener los datos de sabores y toppings.'}, status=500)

@csrf_exempt
def registrar_entrega(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido'}, status=405)
    try:
        data = json.loads(request.body.decode('utf-8'))
        ok, msg = agregar_entrega(data)
        if not ok:
            return JsonResponse({'ok': False, 'error': msg}, status=400)
        return JsonResponse({'ok': True})
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)

@csrf_exempt
def actualizar_pago(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido'}, status=405)
    try:
        data = json.loads(request.body.decode('utf-8'))
        codigo = data.get('codigo', '')
        pagado = bool(data.get('pagado', False))
        ok, msg = marcar_pago(codigo, pagado)
        if not ok:
            return JsonResponse({'ok': False, 'error': msg}, status=400)
        return JsonResponse({'ok': True})
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)

@csrf_exempt
def actualizar_entrega(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido'}, status=405)
    try:
        data = json.loads(request.body.decode('utf-8'))
        codigo = data.get('codigo', '')
        entregado = bool(data.get('entregado', False))
        ok, msg = marcar_entrega(codigo, entregado)
        if not ok:
            return JsonResponse({'ok': False, 'error': msg}, status=400)
        return JsonResponse({'ok': True})
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)
    
@csrf_exempt
def registrar_confirmacion(request):
    """
    Recibe la confirmación del pedido y los datos de entrega para registrarlos.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido'}, status=405)

    try:
        data = json.loads(request.body.decode('utf-8'))
        
        # Validar que los datos esenciales estén presentes
        if not all(k in data for k in ['nombre', 'telefono', 'direccion', 'monto', 'producto', 'codigo']):
            return JsonResponse({'ok': False, 'error': 'Faltan datos obligatorios para el registro.'}, status=400)

        # Llamar a la función que guarda la entrega en la hoja de cálculo
        ok, msg = agregar_entrega(data)

        if not ok:
            return JsonResponse({'ok': False, 'error': f'Error al registrar la entrega: {msg}'}, status=400)
        
        return JsonResponse({'ok': True, 'mensaje': 'Pedido registrado con éxito.'})

    except json.JSONDecodeError:
        return JsonResponse({'ok': False, 'error': 'JSON inválido'}, status=400)
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)