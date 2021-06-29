/* eslint-disable camelcase */
const THIS = 'save-booked:';
/*
 * --------------------------------------------------------------------------------
 * saves appointment booked event to s3
 *
 * event.appointment - flow.data that will be parenthesis enclosed comma-separated
 *                     key=value string. Note that values will not be enclosed in quotes.
 *                     (eg., {k1=v1, k2=v2, k3=v3} )
 *
 * returns
 * . code = 200, if successful
 *
 * . PUT in STATE   (disposition=QUEUED)
 * . PUT in HISTORY (disposition=QUEUED)
 * --------------------------------------------------------------------------------
 */
exports.handler = async function (context, event, callback) {
  console.log(THIS, 'Begin');
  console.time(THIS);
  try {
    const assert = require('assert');
    const AWS = require('aws-sdk');
    const { path } = Runtime.getFunctions().helpers;
    const { getParam, setParam } = require(path);

    // ---------- validate environment variables & input event
    const AWS_ACCESS_KEY_ID = await getParam(context, 'AWS_ACCESS_KEY_ID');
    const AWS_SECRET_ACCESS_KEY = await getParam(
      context,
      'AWS_SECRET_ACCESS_KEY'
    );
    const AWS_REGION = await getParam(context, 'AWS_REGION');
    const AWS_S3_BUCKET = await getParam(context, 'AWS_S3_BUCKET');
    const FILENAME_APPOINTMENT = await getParam(
      context,
      'FILENAME_APPOINTMENT'
    );
    const TWILIO_FLOW_SID = await getParam(context, 'TWILIO_FLOW_SID');
    assert(
      event.hasOwnProperty('appointment'),
      'missing input event.appointment'
    );

    // convert appointment string to json
    const appointment = {};
    const kv_array = event.appointment
      .replace('{', '')
      .replace('}', '')
      .split(',');
    kv_array.forEach(function (a) {
      kv = a.split('=');
      appointment[kv[0].trim()] = kv[1].trim();
    });
    assert(
      appointment.hasOwnProperty('event_type'),
      'missing appointment.event_type'
    );
    assert(
      appointment.hasOwnProperty('patient_id'),
      'missing appointment.patient_id'
    );
    assert(
      appointment.hasOwnProperty('appointment_id'),
      'missing appointment.appointment_id'
    );
    assert(
      appointment.hasOwnProperty('appointment_datetime'),
      'missing appointment.appointment_datetime'
    );
    appointment.event_type = 'BOOKED'; // over-ride

    // initialize s3 client
    const s3 = new AWS.S3({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: AWS_REGION,
    });

    const state_file_s3key = [
      'state',
      `flow=${TWILIO_FLOW_SID}`,
      'disposition={DISPOSITION}',
      FILENAME_APPOINTMENT.replace(
        '{appointment_id}',
        appointment.appointment_id
      ).replace('{patient_id}', appointment.patient_id),
    ].join('/');

    const disposition = 'QUEUED';
    const new_state_file_s3key = state_file_s3key.replace(
      '{DISPOSITION}',
      disposition
    );

    let params = {
      Bucket: AWS_S3_BUCKET,
      Key: new_state_file_s3key,
      Body: JSON.stringify(appointment),
      ServerSideEncryption: 'AES256',
    };
    let results = await s3.putObject(params).promise();
    console.log(THIS, 'PUT - ', params.Key);

    params = {
      Bucket: AWS_S3_BUCKET,
      Key: new_state_file_s3key
        .replace('state', 'history')
        .replace('.json', `-${new Date().getTime()}.json`),
      Body: JSON.stringify(appointment),
      ServerSideEncryption: 'AES256',
    };
    results = await s3.putObject(params).promise();
    console.log(THIS, 'PUT - ', params.Key);

    const response = {
      code: 200,
      event_type: appointment.event_type,
      appointment_s3key: new_state_file_s3key,
    };
    return callback(null, response);
  } catch (err) {
    console.log(err);
    if (err.code === 'ERR_ASSERTION')
      return callback({ error: 'ERR_ASSERTION', message: err.message });
    return callback(err);
  } finally {
    console.timeEnd(THIS);
  }
};
