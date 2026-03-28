from flask import jsonify, request, session
from mysql.connector import Error

from config import DBconnect


def add_spot_to_db(user_id, content, latitude, longitude):
    connection = DBconnect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO notes (userID, content, latitude, longitude, hotspot)
                VALUES (%s, %s, %s, %s, 0)
                """,
                (user_id, content, latitude, longitude),
            )
        connection.commit()
    finally:
        connection.close()


def parse_spot_payload(payload):
    content = (payload.get("content") or "").strip()
    latitude = payload.get("latitude")
    longitude = payload.get("longitude")

    if not content:
        raise ValueError("content is required")

    if latitude is None or longitude is None:
        raise ValueError("latitude and longitude are required")

    return content, float(latitude), float(longitude)


def init_addSpot(app):
    @app.route("/api/spots", methods=["POST"])
    def add_spot_route():
        if not session.get("userID"):
            return jsonify({"error": "Not logged in"}), 401

        payload = request.get_json(silent=True) or {}

        try:
            content, latitude, longitude = parse_spot_payload(payload)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        try:
            add_spot_to_db(session["userID"], content, latitude, longitude)
        except Error as e:
            print(e)
            return jsonify({"error": "Database unavailable"}), 503

        return jsonify(
            {
                "message": "Spot saved",
                "spot": {
                    "userID": session["userID"],
                    "content": content,
                    "latitude": latitude,
                    "longitude": longitude,
                    "hotspot": False,
                },
            }
        ), 201
