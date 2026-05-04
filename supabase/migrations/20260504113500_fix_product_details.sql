-- UPDATE PRODUCT DETAILS
UPDATE products 
SET 
  name = 'Protocolo Dinheiro na Mesa',
  price_text = 'R$ 500,00',
  payment_link = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2631945277-b12d9ad4-02ec-486f-b02c-51da79714b61'
WHERE id = 'sessao_individual';
