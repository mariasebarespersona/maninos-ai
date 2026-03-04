from api.utils.tdhca_parser import build_structured_tdhca_data, sanitize_tdhca_url


def test_sanitize_url_removes_jsessionid():
    url = "https://mhweb.tdhca.state.tx.us/mhweb/title_detail.jsp;jsessionid=ABC123?homeid=123&db=TTL"
    out = sanitize_tdhca_url(url)
    assert ";jsessionid=" not in out
    assert out.endswith("homeid=123&db=TTL")


def test_serial_weight_is_cleaned_and_recovered():
    title_data = {
        "Certificate #": "01191237",
        "Manufacturer": "MHDMAN00000039BRIGADIER HOMES A U.S. HOME COMPANY1001 SOUTH LOOP 340WACO, TX 76710",
        "Model": "CENTURION",
        "Serial": "Weight",  # Bad parse from header row
        "Square Ftg": "700",
    }
    page_text = """
    Certificate #: 01191237
    Manufacturer: BRIGADIER HOMES A U.S. HOME COMPANY 1001 SOUTH LOOP 340 WACO, TX 76710
    Serial #: C3208
    Label/Seal#: TEX0012345
    Square Ftg: 700
    """
    out = build_structured_tdhca_data(
        title_data=title_data,
        page_text=page_text,
        detail_url="https://mhweb.tdhca.state.tx.us/mhweb/title_detail.jsp?homeid=434420&db=TTL",
        print_url=None,
    )
    assert out["serial_number"] == "C3208"
    assert out["label_seal"] == "TEX0012345"


def test_manufacturer_split_concatenated_address():
    title_data = {
        "Manufacturer": "MHDMAN00000039BRIGADIER HOMES A U.S. HOME COMPANY1001 SOUTH LOOP 340WACO, TX 76710",
        "Serial #": "C3208",
    }
    out = build_structured_tdhca_data(
        title_data=title_data,
        page_text="Serial #: C3208",
        detail_url="https://mhweb.tdhca.state.tx.us/mhweb/title_detail.jsp?homeid=1&db=TTL",
        print_url=None,
    )
    assert out["manufacturer"] == "BRIGADIER HOMES A U.S. HOME COMPANY"
    assert out["manufacturer_address"] == "1001 SOUTH LOOP 340"
    assert out["manufacturer_city_state_zip"] == "WACO, TX 76710"


