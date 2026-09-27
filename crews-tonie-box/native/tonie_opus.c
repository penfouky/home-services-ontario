/* Fixed-argument wrappers around libopus for .NET P/Invoke.
   opus_encoder_ctl() is variadic, and on Apple Silicon variadic arguments are passed on the
   stack, so it cannot be called through a P/Invoke signature with fixed arguments. */
#include "opus.h"

#define EXPORT __attribute__((visibility("default")))

EXPORT const char *tonie_opus_version(void)
{
    return opus_get_version_string();
}

/* 48 kHz stereo music encoder, as used for tonie files */
EXPORT OpusEncoder *tonie_opus_encoder_new(int bitrate, int vbr, int complexity, int *lookahead, int *error)
{
    opus_int32 la = 0;
    OpusEncoder *enc = opus_encoder_create(48000, 2, OPUS_APPLICATION_AUDIO, error);

    if (!enc)
        return 0;
    opus_encoder_ctl(enc, OPUS_SET_BITRATE(bitrate));
    opus_encoder_ctl(enc, OPUS_SET_VBR(vbr));
    opus_encoder_ctl(enc, OPUS_SET_COMPLEXITY(complexity));
    opus_encoder_ctl(enc, OPUS_GET_LOOKAHEAD(&la));
    *lookahead = la;
    return enc;
}

EXPORT int tonie_opus_encode(OpusEncoder *enc, const float *pcm, int frame_size, unsigned char *data, int max_bytes)
{
    return opus_encode_float(enc, pcm, frame_size, data, max_bytes);
}

EXPORT void tonie_opus_encoder_free(OpusEncoder *enc)
{
    opus_encoder_destroy(enc);
}

EXPORT OpusDecoder *tonie_opus_decoder_new(int *error)
{
    return opus_decoder_create(48000, 2, error);
}

EXPORT int tonie_opus_decode(OpusDecoder *dec, const unsigned char *data, int len, float *pcm, int max_frame_size)
{
    return opus_decode_float(dec, data, len, pcm, max_frame_size, 0);
}

EXPORT void tonie_opus_decoder_free(OpusDecoder *dec)
{
    opus_decoder_destroy(dec);
}

/* grows a packet to new_len bytes with Opus padding, the decoder ignores the padding */
EXPORT int tonie_opus_packet_pad(unsigned char *data, int len, int new_len)
{
    return opus_packet_pad(data, len, new_len);
}
