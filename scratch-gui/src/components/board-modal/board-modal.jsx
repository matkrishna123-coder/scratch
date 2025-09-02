import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';

import Modal from '../modal/modal.jsx';
import Box from '../box/box.jsx';

import styles from './board-modal.css';

const BoardModal = props => (
    <Modal
        className={styles.modalContent}
        contentLabel="Board"
        headerClassName={styles.header}
        id="boardModal"
        onRequestClose={props.onRequestClose}
    >
        <Box className={styles.body}>
            <div className={styles.content}>
                <h2 className={styles.title}>
                    <FormattedMessage
                        defaultMessage="Board"
                        description="Title for board modal"
                        id="gui.boardModal.title"
                    />
                </h2>
                <p className={styles.description}>
                    <FormattedMessage
                        defaultMessage="This is the Board overlay. You can add your board-related content here."
                        description="Description for board modal"
                        id="gui.boardModal.description"
                    />
                </p>
            </div>
        </Box>
    </Modal>
);

BoardModal.propTypes = {
    onRequestClose: PropTypes.func.isRequired
};

export default BoardModal;
