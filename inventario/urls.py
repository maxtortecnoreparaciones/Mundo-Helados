from django.urls import path
from . import views

urlpatterns = [
    path('consultar_stock/<str:codigo>/', views.consultar_stock, name='consultar_stock'),
    path('buscar_producto_por_nombre/', views.buscar_producto_por_nombre, name='buscar_producto_por_nombre'),
    path('registrar_entrega/', views.registrar_entrega, name='registrar_entrega'),
    path('actualizar_pago/', views.actualizar_pago, name='actualizar_pago'),
    path('actualizar_entrega/', views.actualizar_entrega, name='actualizar_entrega'),
    path('consultar_sabores_y_toppings/', views.consultar_sabores_y_toppings, name='consultar_sabores_y_toppings'),
    path('registrar_confirmacion/', views.registrar_confirmacion, name='registrar_confirmacion'),
]