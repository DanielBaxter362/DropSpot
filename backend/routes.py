import hashlib
import math

from flask import jsonify, redirect, render_template, request, session, url_for
from mysql.connector import Error

from config import DBconnect


SEARCH_RADIUS_MILES = 1
HOTSPOT_RADIUS_METRES = 50
HOTSPOT_THRESHOLD = 2


def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def get_user_by_email(email):
    connection = DBconnect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT userID, email, hashPW FROM users WHERE email = %s",
                (email,),
            )
            return cursor.fetchone()
    finally:
        connection.close()


def create_user(email, password):
    connection = DBconnect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO users (email, hashPW) VALUES (%s, %s)",
                (email, hash_password(password)),
            )
        connection.commit()
    finally:
        connection.close()


def handle_nearby_spots_request(latitude, longitude):
    connection = DBconnect()
    try:
        with connection.cursor(dictionary=True) as cursor:
            cursor.execute(
                """
                SELECT latitude, longitude
                FROM notes
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                """,
            )
            rows = cursor.fetchall()
    finally:
        connection.close()

    nearby_notes = []

    for row in rows:
        note_lat = float(row["latitude"])
        note_lng = float(row["longitude"])
        distance = get_distance_in_miles(latitude, longitude, note_lat, note_lng)

        if distance <= SEARCH_RADIUS_MILES:
            nearby_notes.append(
                {
                    "latitude": note_lat,
                    "longitude": note_lng,
                }
            )

    return {
        "searchCenter": {
            "latitude": latitude,
            "longitude": longitude,
        },
        "radiusMiles": SEARCH_RADIUS_MILES,
        "count": len(nearby_notes),
        "notes": nearby_notes,
    }


def handle_hotspot_update_request(latitude, longitude, user_id):
    connection = DBconnect()
    try:
        with connection.cursor(dictionary=True) as cursor:
            cursor.execute(
                """
                SELECT noteID, latitude, longitude
                FROM notes
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                """
            )
            notes = cursor.fetchall()
            hotspot_note_ids = set()
            note_ids = [note["noteID"] for note in notes]
            adjacency = {note_id: set() for note_id in note_ids}

            for i in range(len(notes)):
                for j in range(i + 1, len(notes)):
                    first_note = notes[i]
                    second_note = notes[j]

                    distance = get_distance_in_metres(
                        float(first_note["latitude"]),
                        float(first_note["longitude"]),
                        float(second_note["latitude"]),
                        float(second_note["longitude"]),
                    )

                    if distance <= HOTSPOT_RADIUS_METRES:
                        adjacency[first_note["noteID"]].add(second_note["noteID"])
                        adjacency[second_note["noteID"]].add(first_note["noteID"])

            visited_note_ids = set()

            for note_id in note_ids:
                if note_id in visited_note_ids:
                    continue

                stack = [note_id]
                cluster_note_ids = set()

                while stack:
                    current_note_id = stack.pop()

                    if current_note_id in visited_note_ids:
                        continue

                    visited_note_ids.add(current_note_id)
                    cluster_note_ids.add(current_note_id)

                    for neighbour_id in adjacency[current_note_id]:
                        if neighbour_id not in visited_note_ids:
                            stack.append(neighbour_id)

                if len(cluster_note_ids) >= HOTSPOT_THRESHOLD:
                    hotspot_note_ids.update(cluster_note_ids)

            cursor.execute("UPDATE notes SET hotspot = 0")

            for note_id in hotspot_note_ids:
                cursor.execute(
                    "UPDATE notes SET hotspot = 1 WHERE noteID = %s",
                    (note_id,),
                )

        connection.commit()
    finally:
        connection.close()

    return {
        "hotspotCount": len(hotspot_note_ids),
        "hotspot": len(hotspot_note_ids) > 0,
        "radiusMetres": HOTSPOT_RADIUS_METRES,
        "threshold": HOTSPOT_THRESHOLD,
    }


def get_distance_in_miles(lat1, lng1, lat2, lng2):
    earth_radius_miles = 3959

    lat1 = math.radians(lat1)
    lng1 = math.radians(lng1)
    lat2 = math.radians(lat2)
    lng2 = math.radians(lng2)

    delta_lat = lat2 - lat1
    delta_lng = lng2 - lng1

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return earth_radius_miles * c


def get_distance_in_metres(lat1, lng1, lat2, lng2):
    earth_radius_metres = 6371000

    lat1 = math.radians(lat1)
    lng1 = math.radians(lng1)
    lat2 = math.radians(lat2)
    lng2 = math.radians(lng2)

    delta_lat = lat2 - lat1
    delta_lng = lng2 - lng1

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return earth_radius_metres * c


def init_routes(app):
    @app.route("/")
    def index():
        if session.get("userID"):
            return redirect(url_for("home"))
        return redirect(url_for("login"))

    @app.route("/register", methods=["GET", "POST"])
    def register():
        message = ""

        if request.method == "POST":
            email = request.form.get("email", "")
            password = request.form.get("password", "")

            try:
                if get_user_by_email(email):
                    message = "Account already exists."
                else:
                    create_user(email, password)
                    return redirect(url_for("login"))
            except Error as e:
                print(e)
                message = "Database is busy right now. Try again in a minute."

        return render_template("register.html", message=message)

    @app.route("/login", methods=["GET", "POST"])
    def login():
        message = ""

        if request.method == "POST":
            email = request.form.get("email", "")
            password = request.form.get("password", "")
            try:
                user = get_user_by_email(email)

                if user and user[2] == hash_password(password):
                    session["userID"] = user[0]
                    session["email"] = user[1]
                    return redirect(url_for("home"))

                message = "Invalid login."
            except Error as e:
                print(e)
                message = "Database is busy right now. Try again in a minute."

        return render_template("login.html", message=message)

    @app.route("/home")
    def home():
        if not session.get("userID"):
            return redirect(url_for("login"))
        return render_template("home.html", email=session.get("email"))

    @app.route("/logout")
    def logout():
        session.clear()
        return redirect(url_for("login"))

    @app.route("/api/spots/nearby", methods=["POST"])
    def api_nearby_spots():
        payload = request.get_json(silent=True) or {}
        latitude = payload.get("latitude")
        longitude = payload.get("longitude")

        if latitude is None or longitude is None:
            return jsonify({"error": "latitude and longitude are required"}), 400

        try:
            latitude = float(latitude)
            longitude = float(longitude)
        except (TypeError, ValueError):
            return jsonify({"error": "latitude and longitude must be numbers"}), 400

        try:
            result = handle_nearby_spots_request(latitude, longitude)
            return jsonify(result), 200
        except Error as e:
            print(e)
            return jsonify({"error": "Database unavailable"}), 503

    @app.route("/api/hotspots/update", methods=["POST"])
    def update_hotspots_route():
        if not session.get("userID"):
            return jsonify({"error": "Not logged in"}), 401

        payload = request.get_json(silent=True) or {}
        latitude = payload.get("latitude")
        longitude = payload.get("longitude")

        if latitude is None or longitude is None:
            return jsonify({"error": "latitude and longitude are required"}), 400

        try:
            latitude = float(latitude)
            longitude = float(longitude)
        except (TypeError, ValueError):
            return jsonify({"error": "Invalid coordinates"}), 400

        try:
            result = handle_hotspot_update_request(latitude, longitude, session["userID"])
            return jsonify(result), 200
        except Error as e:
            print(e)
            return jsonify({"error": "Database unavailable"}), 503
