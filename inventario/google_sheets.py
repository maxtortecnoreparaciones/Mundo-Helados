import gspread
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime

SERVICE_ACCOUNT_FILE = 'service_account.json'
ENTREGAS_SPREADSHEET_ID = '1479sKgwA2ES503noFusdM-rOYv412-ogcqEouI6zQgI'
ENTREGAS_SHEET_NAME = 'Entregas'

def conectar_sheet():
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name(SERVICE_ACCOUNT_FILE, scope)
    cliente = gspread.authorize(creds)
    sheet = cliente.open_by_key('10twtfwsAbyxZ4D_0ChD34oFkwa_EWKAWPGVfk1FdEHM').sheet1
    return sheet

def obtener_inventario():
    sheet = conectar_sheet()
    data = sheet.get_all_records()
    return data

def obtener_datos_inventario():
    return obtener_inventario()

def _client():
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name(SERVICE_ACCOUNT_FILE, scope)
    return gspread.authorize(creds)

def conectar_sheet_inventario():
    client = _client()
    return client.open_by_key('10twtfwsAbyxZ4D_0ChD34oFkwa_EWKAWPGVfk1FdEHM').sheet1

def _cliente_gs():
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name(SERVICE_ACCOUNT_FILE, scope)
    return gspread.authorize(creds)

def _ws_entregas():
    client = _cliente_gs()
    ss = client.open_by_key(ENTREGAS_SPREADSHEET_ID)
    try:
        return ss.worksheet(ENTREGAS_SHEET_NAME)
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title=ENTREGAS_SHEET_NAME, rows=1000, cols=20)
        ws.append_row([
            'Fecha', 'Nombre', 'Producto', 'Codigo', 'Telefono', 'Direccion',
            'Monto', 'Pago', 'Estado', 'Observaciones', 'ReferidoPor'
        ])
        return ws

def agregar_entrega(data: dict):
    try:
        ws = _ws_entregas()
        fecha = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        fila = [
            fecha,
            data.get('nombre', ''),
            data.get('producto', ''),
            data.get('codigo', ''),
            data.get('telefono', ''),
            data.get('direccion', ''),
            data.get('monto', ''),
            data.get('pago', 'Pendiente'),
            data.get('estado', 'Por despachar'),
            data.get('observaciones', ''),
            data.get('referido_por', '')
        ]
        ws.append_row(fila, value_input_option='USER_ENTERED')
        return True, ''
    except Exception as e:
        return False, str(e)

def marcar_pago(codigo: str, pagado: bool):
    try:
        ws = _ws_entregas()
        c = ws.find(codigo)
        if not c:
            return False, 'Código no encontrado en Entregas'
        row = c.row
        ws.update_cell(row, 8, 'Pagado' if pagado else 'Pendiente')
        return True, ''
    except Exception as e:
        return False, str(e)

def marcar_entrega(codigo: str, entregado: bool):
    try:
        ws = _ws_entregas()
        c = ws.find(codigo)
        if not c:
            return False, 'Código no encontrado en Entregas'
        row = c.row
        ws.update_cell(row, 9, 'Entregado' if entregado else 'En ruta')
        return True, ''
    except Exception as e:
        return False, str(e)