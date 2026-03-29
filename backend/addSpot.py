from flask import jsonify, request, session
from mysql.connector import Error
import datetime

from config import DBconnect

NOTE_CONTENT_SEPARATOR = "\n---DROPSPOT-DESC---\n"


def add_spot_to_db(user_id, content, latitude, longitude, createdAt):
    connection = DBconnect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO notes (userID, content, latitude, longitude, hotspot, createdAt)
                VALUES (%s, %s, %s, %s, 0, %s)
                """,
                (user_id, content, latitude, longitude, createdAt),
            )
        connection.commit()
    finally:
        connection.close()


def combine_note_content(title, description):
    clean_title = " ".join(str(title or "").split()).strip()
    clean_description = str(description or "").strip()

    if not clean_title:
        raise ValueError("title is required")

    if not clean_description:
        raise ValueError("description is required")

    return f"{clean_title}{NOTE_CONTENT_SEPARATOR}{clean_description}"


def parse_spot_payload(payload):
    title = (payload.get("title") or "").strip()
    description = (payload.get("description") or "").strip()
    latitude = payload.get("latitude")
    longitude = payload.get("longitude")

    if latitude is None or longitude is None:
        raise ValueError("latitude and longitude are required")

    content = combine_note_content(title, description)

    return title, description, content, float(latitude), float(longitude)


def init_addSpot(app):
    @app.route("/api/spots", methods=["POST"])
    def add_spot_route():
        if not session.get("userID"):
            return jsonify({"error": "Not logged in"}), 401

        payload = request.get_json(silent=True) or {}

        try:
            title, description, content, latitude, longitude = parse_spot_payload(payload)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        try:
            createdAt = datetime.datetime(now)
            add_spot_to_db(session["userID"], content, latitude, longitude, createdAt)
        except Error as e:
            print(e)
            return jsonify({"error": "Database unavailable"}), 503

        return jsonify(
            {
                "message": "Spot saved",
                "spot": {
                    "userID": session["userID"],
                    "title": title,
                    "description": description,
                    "content": content,
                    "latitude": latitude,
                    "longitude": longitude,
                    "hotspot": False,
                    "datetime" : createdAt,
                },
            }
        ), 201
